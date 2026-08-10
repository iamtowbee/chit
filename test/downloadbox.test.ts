import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ContinueClient } from '../src/client.js';
import { createDownloadBox } from '../src/downloadbox.js';
import { Downloader } from '../src/downloader.js';
import { JsonFileStore } from '../src/store.js';

const CONTENT = Buffer.from(
  'the quick brown fox jumps over the lazy dog '.repeat(20),
);

function startFileServer() {
  const ranges: string[] = [];
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) ranges.push(range);
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : CONTENT.length - 1;
        const slice = CONTENT.subarray(start, end + 1);
        res.writeHead(206, {
          'content-range': `bytes ${start}-${end}/${CONTENT.length}`,
          'content-length': slice.length,
          'accept-ranges': 'bytes',
          etag: '"testfile"',
        });
        res.end(slice);
        return;
      }
    }
    res.writeHead(200, {
      'content-length': CONTENT.length,
      'accept-ranges': 'bytes',
      etag: '"testfile"',
    });
    res.end(CONTENT);
  });
  return { server, ranges };
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

let apiPort: number;
let filePort: number;
let dataDir: string;
let workDir: string;
let fileServer: http.Server;
let apiServer: http.Server;
let client: ContinueClient;
let fileServerRanges: string[];

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'continue-dbox-data-'));
  workDir = await mkdtemp(path.join(os.tmpdir(), 'continue-dbox-work-'));
  await mkdir(path.join(workDir, 'downloads'), { recursive: true });
  const file = startFileServer();
  fileServer = file.server;
  fileServerRanges = file.ranges;
  filePort = await listen(fileServer);
  const { app } = createApp({ store: new JsonFileStore(dataDir) });
  apiServer = http.createServer(app);
  apiPort = await listen(apiServer);
  client = new ContinueClient({ baseUrl: `http://127.0.0.1:${apiPort}` });
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    fileServer.close((err) => (err ? reject(err) : resolve())),
  );
  await new Promise<void>((resolve, reject) =>
    apiServer.close((err) => (err ? reject(err) : resolve())),
  );
  await rm(dataDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe('download box', () => {
  it('downloads a file end to end and completes the session', { timeout: 15000 }, async () => {
    const downloadDir = path.join(workDir, 'downloads');    const box = createDownloadBox({ client, downloadDir });
    const boxServer = http.createServer(box.app);
    const boxPort = await listen(boxServer);
    box.start();

    const url = `http://127.0.0.1:${filePort}/big.zip`;
    const res = await fetch(`http://127.0.0.1:${boxPort}/downloads/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    expect(res.status).toBe(201);

    await waitFor(async () => {
      const list = await fetch(`http://127.0.0.1:${boxPort}/downloads/jobs`).then(
        (r) => r.json(),
      );
      const job = list.jobs[0];
      return job?.session.status === 'done';
    });

    const done = await fetch(`http://127.0.0.1:${boxPort}/downloads/jobs`).then(
      (r) => r.json(),
    );
    expect(done.jobs[0].session.status).toBe('done');
    expect(done.jobs[0].file.done).toBe(true);
    const saved = await readFile(path.join(downloadDir, 'big.zip'));
    expect(saved.equals(CONTENT)).toBe(true);

    boxServer.close();
    box.stop();
  });

  it('resumes from the byte saved in the part file via a Range request', { timeout: 15000 }, async () => {
    const downloadDir = path.join(workDir, 'downloads');
    const downloader = new Downloader({ client, downloadDir });

    const created = await client.create({
      metadata: { url: `http://127.0.0.1:${filePort}/data.bin`, filename: 'data.bin' },
    });
    const partPath = path.join(downloadDir, 'data.bin.part');
    await writeFile(partPath, CONTENT.subarray(0, 40));

    await downloader.download(await client.get(created.id));

    const session = await client.get(created.id);
    expect(session.status).toBe('done');
    const saved = await readFile(path.join(downloadDir, 'data.bin'));
    expect(saved.equals(CONTENT)).toBe(true);
    expect(fileServerRanges).toContain('bytes=40-');
  });

  it('supports cancel and pause via the UI endpoints', { timeout: 15000 }, async () => {
    const downloadDir = path.join(workDir, 'downloads');
    const box = createDownloadBox({ client, downloadDir });
    const boxServer = http.createServer(box.app);
    const boxPort = await listen(boxServer);

    const url = `http://127.0.0.1:${filePort}/thing.iso`;
    const res = await fetch(`http://127.0.0.1:${boxPort}/downloads/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, filename: 'thing.iso' }),
    });
    const { session } = (await res.json()) as { session: { id: string } };

    const paused = await fetch(
      `http://127.0.0.1:${boxPort}/downloads/jobs/${session.id}/pause`,
      { method: 'POST' },
    ).then((r) => r.json());
    expect(paused.session.status).toBe('paused');

    const cancelled = await fetch(
      `http://127.0.0.1:${boxPort}/downloads/jobs/${session.id}/cancel`,
      { method: 'POST' },
    ).then((r) => r.json());
    expect(cancelled.session.status).toBe('cancelled');

    boxServer.close();
    box.stop();
  });
});
