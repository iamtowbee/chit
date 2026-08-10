import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { promises as fsp } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContinueClient } from './client.js';
import { Downloader, StopError } from './downloader.js';
import { HttpError } from './errors.js';
import type { Session } from './types.js';

export interface DownloadBoxOptions {
  client: ContinueClient;
  downloadDir: string;
  log?: (message: string) => void;
  pollMs?: number;
}

export interface DownloadBoxHandle {
  app: express.Express;
  start: () => void;
  stop: () => void;
  tick: () => Promise<void>;
}

const PROCESSABLE = new Set(['queued', 'stalled', 'retrying', 'active', 'resuming']);

/**
 * A real-world consumer of the continue API: a "download box" that runs on a
 * wall-powered machine. Paste a URL, it downloads the file in the background
 * with Range-based resume; crashes and reboots pick up where they left off via
 * the API's checkpoints. Your phone never has to do the work.
 */
export function createDownloadBox(options: DownloadBoxOptions): DownloadBoxHandle {
  const { client, downloadDir, log } = options;
  const pollMs = options.pollMs ?? 1500;
  const logger = log ?? (() => undefined);

  const downloader = new Downloader({
    client,
    downloadDir,
    log: logger,
    isInterrupted: async (session) => {
      const fresh = await client.get(session.id).catch(() => session);
      return fresh.status === 'paused' || fresh.status === 'cancelled';
    },
  });

  const processing = new Set<string>();
  const cooldownUntil = new Map<string, number>();
  let working = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick(): Promise<void> {
    if (working) return;
    working = true;
    try {
      const sessions = await client.list();
      const candidate = sessions.find(
        (session) =>
          PROCESSABLE.has(session.status) &&
          !processing.has(session.id) &&
          Date.now() >= (cooldownUntil.get(session.id) ?? 0),
      );
      if (!candidate) return;
      processing.add(candidate.id);
      try {
        await downloader.download(candidate);
      } catch (err) {
        if (err instanceof StopError) {
          logger(`${candidate.id}: stopped (${err.message})`);
        } else {
          logger(`${candidate.id}: ${err instanceof Error ? err.message : String(err)}`);
          await client.stall(candidate.id).catch(() => undefined);
          cooldownUntil.set(candidate.id, Date.now() + 15_000);
        }
      } finally {
        processing.delete(candidate.id);
      }
    } catch (err) {
      logger(`continue API unreachable: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      working = false;
    }
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      tick().catch(() => undefined);
    }, pollMs);
    timer.unref?.();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(UI);
  });

  app.post(
    '/downloads/jobs',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const url = typeof req.body?.url === 'string' ? req.body.url : '';
        if (!/^https?:\/\//i.test(url)) {
          throw new HttpError(400, 'url must be an http(s) URL');
        }
        const filename = sanitizeFilename(
          typeof req.body?.filename === 'string' && req.body.filename
            ? req.body.filename
            : deriveFilename(url),
        );
        const created = await client.create({ metadata: { url, filename } });
        const session = await client.queue(created.id);
        logger(`enqueued ${filename} (${session.id})`);
        res.status(201).json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/downloads/jobs',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const sessions = await client.list();
        const jobs = await Promise.all(
          sessions.map(async (session) => {
            const metadata = session.metadata as { filename?: string };
            const filename = metadata.filename ?? 'download';
            const isDone = session.status === 'done';
            const candidate = path.join(
              downloadDir,
              isDone ? filename : `${filename}.part`,
            );
            let size = 0;
            try {
              const stat = await fsp.stat(candidate);
              size = stat.size;
            } catch {
              size = 0;
            }
            const data = session.data as
              | { offset?: number; length?: number | null }
              | null
              | undefined;
            return {
              session,
              file: {
                filename,
                size,
                offset: data?.offset ?? size,
                length: data?.length ?? null,
                done: isDone,
              },
            };
          }),
        );
        res.json({ jobs });
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/downloads/jobs/:id/pause',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        let session = await client.get(req.params.id!);
        if (session.status === 'pending' || session.status === 'queued') {
          if (session.status === 'pending') session = await client.queue(session.id);
          session = await client.start(session.id);
        }
        session = await client.pause(session.id);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/downloads/jobs/:id/resume',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await client.resume(req.params.id!);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/downloads/jobs/:id/retry',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await client.retry(req.params.id!);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/downloads/jobs/:id/cancel',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const before = await client.get(req.params.id!);
        const metadata = before.metadata as { filename?: string };
        const filename = metadata.filename;
        const session = await client.cancel(req.params.id!, 'user cancelled');
        if (filename) {
          await fsp
            .unlink(path.join(downloadDir, `${filename}.part`))
            .catch(() => undefined);
        }
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/downloads/files/:name',
    (req: Request, res: Response, next: NextFunction) => {
      const name = sanitizeFilename(req.params.name!);
      res.sendFile(path.join(downloadDir, name), (err) => {
        if (err) next(new HttpError(404, 'file not found'));
      });
    },
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: message });
  });

  return { app, start, stop, tick };
}

export function startDownloadBox(): { server: http.Server; handle: DownloadBoxHandle } {
  const port = Number(process.env.PORT ?? 3000);
  const baseUrl =
    process.env.CONTINUE_BASE_URL ?? 'http://127.0.0.1:3001';
  const downloadDir = path.resolve(process.env.DOWNLOAD_DIR ?? './downloads');
  const client = new ContinueClient({ baseUrl });

  const handle = createDownloadBox({
    client,
    downloadDir,
    log: (message) => console.log(`[downloadbox] ${message}`),
  });
  const server = http.createServer(handle.app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`download box listening on http://0.0.0.0:${port}`);
    console.log(`  continue API: ${baseUrl}`);
    console.log(`  downloads go to: ${downloadDir}`);
  });
  handle.start();

  const shutdown = (): void => {
    handle.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, handle };
}

function deriveFilename(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const base = path.basename(url.pathname);
    if (base && base !== '/') return base;
    return url.hostname || 'download';
  } catch {
    return 'download';
  }
}

function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[\\/]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.trim() === '' ? 'download' : clean;
}

const UI = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Download Box</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
      h1 { font-size: 1.5rem; }
      form { display: flex; gap: .5rem; margin: 1rem 0; }
      input[type=url] { flex: 1; padding: .5rem; }
      button { padding: .5rem .9rem; cursor: pointer; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #eee; vertical-align: middle; }
      .bar { background: #eee; height: 8px; border-radius: 4px; overflow: hidden; min-width: 120px; }
      .bar > div { background: #2f9e44; height: 100%; transition: width .3s; }
      .badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .75rem; }
      .done { background: #d3f9d8; color: #2b8a3e; }
      .pending, .queued { background: #fff3bf; color: #862e9c; }
      .active, .resuming, .retrying { background: #d0ebff; color: #1c7ed6; }
      .paused, .stalled { background: #ffe8cc; color: #e8590c; }
      .failed, .cancelled { background: #ffc9c9; color: #c92a2a; }
      .empty { color: #888; padding: 2rem 0; }
      .err { color: #c92a2a; margin: .5rem 0; }
      .bytes { font-size: .8rem; color: #666; white-space: nowrap; }
    </style>
  </head>
  <body>
    <h1>Download Box</h1>
    <p>Paste a URL — this machine downloads it in the background. Interrupted jobs resume from where they stopped.</p>
    <form id="add">
      <input type="url" id="url" placeholder="https://example.com/file.zip" required />
      <input type="text" id="name" placeholder="filename (optional)" style="max-width: 14rem" />
      <button type="submit">Download</button>
    </form>
    <div id="err" class="err"></div>
    <table>
      <thead><tr><th>File</th><th>Status</th><th>Progress</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <p id="empty" class="empty">No jobs yet. Add a URL above.</p>

    <script>
      const rows = document.getElementById('rows');
      const empty = document.getElementById('empty');
      const err = document.getElementById('err');
      const fmt = (n) => {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KiB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MiB';
        return (n / 1073741824).toFixed(2) + ' GiB';
      };
      const action = (id, verb) => fetch('/downloads/jobs/' + id + '/' + verb, { method: 'POST' });
      const buttons = (job) => {
        const s = job.session.status;
        let html = '';
        if (s === 'active' || s === 'queued' || s === 'stalled' || s === 'retrying' || s === 'resuming') {
          html += '<button onclick="action(\'' + job.session.id + '\',\'pause\')">Pause</button> ';
        }
        if (s === 'paused' || s === 'stalled') {
          html += '<button onclick="action(\'' + job.session.id + '\',\'resume\')">Resume</button> ';
        }
        if (s === 'stalled') {
          html += '<button onclick="action(\'' + job.session.id + '\',\'retry\')">Retry</button> ';
        }
        if (s !== 'done' && s !== 'cancelled' && s !== 'failed') {
          html += '<button onclick="action(\'' + job.session.id + '\',\'cancel\')">Cancel</button> ';
        }
        if (job.file.done) {
          html += '<a href="/downloads/files/' + encodeURIComponent(job.file.filename) + '">Open</a>';
        }
        return html;
      };
      async function refresh() {
        try {
          const res = await fetch('/downloads/jobs');
          const data = await res.json();
          const jobs = data.jobs || [];
          empty.style.display = jobs.length ? 'none' : 'block';
          rows.innerHTML = jobs.map((job) => {
            const s = job.session.status;
            const offset = job.file.offset || 0;
            const length = job.file.length;
            const pct = length ? Math.min(100, Math.round(offset / length * 100)) : 0;
            const bytes = (job.file.done ? job.file.size : offset) + ' / ' + (length ? fmt(length) : '?');
            return '<tr>' +
              '<td>' + job.file.filename + '<div class="bytes">' + bytes + '</div></td>' +
              '<td><span class="badge ' + s + '">' + s + '</span></td>' +
              '<td><div class="bar"><div style="width:' + pct + '%"></div></div></td>' +
              '<td>' + buttons(job) + '</td>' +
            '</tr>';
          }).join('');
          err.textContent = '';
        } catch (e) {
          err.textContent = "Can't reach the download box: " + e;
        }
      }
      window.action = action;
      document.getElementById('add').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { url: document.getElementById('url').value };
        const name = document.getElementById('name').value.trim();
        if (name) body.filename = name;
        const res = await fetch('/downloads/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          err.textContent = (data && data.error) || 'failed to enqueue';
          return;
        }
        document.getElementById('url').value = '';
        document.getElementById('name').value = '';
        refresh();
      });
      refresh();
      setInterval(refresh, 1500);
    </script>
  </body>
</html>`;

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    startDownloadBox();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
