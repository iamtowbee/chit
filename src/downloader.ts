import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { ContinueClient } from './client.js';
import type { Session } from './types.js';

export class StopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StopError';
  }
}

export interface DownloaderOptions {
  client: ContinueClient;
  downloadDir: string;
  /** Heartbeat every N bytes (default 512 KiB). */
  heartbeatBytes?: number;
  /** Consecutive chunk failures before giving up (default 5). */
  maxChunkRetries?: number;
  /** Base backoff for chunk retries (default 1s, doubles each attempt). */
  retryBaseMs?: number;
  log?: (message: string) => void;
  /** Called between heartbeats; return true to stop (pause/cancel). */
  isInterrupted?: (session: Session) => Promise<boolean>;
}

interface StreamResult {
  length: number | null;
  etag: string | null;
  offset: number;
}

/**
 * Downloads a URL into `downloadDir` with resumable Range requests.
 * Progress is reported through heartbeat checkpoints on the continue API,
 * so an interrupted job resumes from the exact byte where it stopped.
 */
export class Downloader {
  private readonly client: ContinueClient;
  private readonly downloadDir: string;
  private readonly heartbeatBytes: number;
  private readonly maxChunkRetries: number;
  private readonly retryBaseMs: number;
  private readonly log: (message: string) => void;
  private readonly isInterrupted: (session: Session) => Promise<boolean>;

  constructor(options: DownloaderOptions) {
    this.client = options.client;
    this.downloadDir = options.downloadDir;
    this.heartbeatBytes = options.heartbeatBytes ?? 512 * 1024;
    this.maxChunkRetries = options.maxChunkRetries ?? 5;
    this.retryBaseMs = options.retryBaseMs ?? 1000;
    this.log = options.log ?? (() => undefined);
    this.isInterrupted =
      options.isInterrupted ?? (async () => false);
  }

  async download(session: Session): Promise<Session> {
    await fsp.mkdir(this.downloadDir, { recursive: true });
    const metadata = session.metadata as { url?: string; filename?: string };
    const url = metadata.url;
    if (!url) {
      throw new Error(`session ${session.id} has no url in metadata`);
    }
    const filename = metadata.filename ?? 'download';
    const partPath = path.join(this.downloadDir, `${filename}.part`);
    const finalPath = path.join(this.downloadDir, filename);

    if (await this.isInterrupted(session)) {
      throw new StopError('interrupted before start');
    }

    let offset = await this.partSize(partPath);
    session = await this.wake(session);
    session = await this.client.heartbeat(session.id, {
      step: offset,
      progress: 0,
      data: { url, filename, offset, length: null, etag: null },
    });

    let length: number | null = null;
    let etag: string | null = null;
    let attempts = 0;
    for (;;) {
      attempts += 1;
      try {
        const result = await this.stream(url, offset, partPath, session);
        length = result.length;
        etag = result.etag;
        offset = result.offset;
        break;
      } catch (err) {
        if (err instanceof StopError) throw err;
        offset = await this.partSize(partPath);
        if (attempts >= this.maxChunkRetries) {
          throw new Error(
            `giving up after ${attempts} attempts: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        const backoff = this.retryBaseMs * 2 ** (attempts - 1);
        this.log(`${filename}: chunk attempt ${attempts} failed, retrying in ${backoff}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    session = await this.client.heartbeat(session.id, {
      step: offset,
      progress: length ? Math.min(1, offset / length) : 0,
      data: { url, filename, offset, length, etag },
    });

    await fsp.rename(partPath, finalPath);
    this.log(`${filename}: complete (${offset} bytes)`);

    session = await this.client.complete(session.id, {
      url,
      filename,
      bytes: offset,
      etag,
    });
    return this.client.finalize(session.id);
  }

  private async stream(
    url: string,
    startOffset: number,
    partPath: string,
    session: Session,
  ): Promise<StreamResult> {
    const res = await fetch(url, {
      headers: {
        range: `bytes=${startOffset}-`,
        'user-agent': 'continue-protocol-downloadbox/1.0',
      },
    });
    if (res.status !== 200 && res.status !== 206) {
      throw new Error(`server responded HTTP ${res.status}`);
    }

    const resuming = res.status === 206;
    let offset = startOffset;
    if (!resuming && startOffset > 0) {
      this.log('server ignored Range; restarting from byte 0');
      await fsp.writeFile(partPath, Buffer.alloc(0));
      offset = 0;
    }

    let length: number | null = null;
    const contentRange = res.headers.get('content-range');
    if (resuming && contentRange) {
      const match = /bytes \d+-\d+\/(\d+|\*)/.exec(contentRange);
      if (match && match[1] !== '*') length = Number(match[1]);
    }
    const contentLength = res.headers.get('content-length');
    if (length === null && contentLength !== null) {
      length = resuming ? offset + Number(contentLength) : Number(contentLength);
    }
    const etag = res.headers.get('etag');

    const handle = await fsp.open(partPath, offset === 0 ? 'w' : 'a');
    let received = offset;
    let lastBeat = 0;
    try {
      const reader = res.body?.getReader();
      if (!reader) throw new Error('response has no body');
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
        received += value.byteLength;
        if (received - lastBeat >= this.heartbeatBytes) {
          lastBeat = received;
          await this.beat(session, received, length, etag);
          if (await this.isInterrupted(session)) {
            throw new StopError('interrupted mid-download');
          }
        }
      }
      reader.releaseLock();
    } finally {
      await handle.close();
    }

    if (length !== null && received < length) {
      throw new Error(`incomplete download ${received}/${length} bytes`);
    }
    return { length, etag, offset: received };
  }

  private async beat(
    session: Session,
    offset: number,
    length: number | null,
    etag: string | null,
  ): Promise<void> {
    const metadata = session.metadata as { url?: string; filename?: string };
    await this.client.heartbeat(session.id, {
      step: offset,
      progress: length ? Math.min(1, offset / length) : 0,
      data: {
        url: metadata.url,
        filename: metadata.filename,
        offset,
        length,
        etag,
      },
    });
  }

  /** Move any processable status into `active` using valid transitions. */
  private async wake(session: Session): Promise<Session> {
    if (session.status === 'pending') {
      session = await this.client.queue(session.id);
      return this.client.start(session.id);
    }
    if (session.status === 'queued') {
      return this.client.start(session.id);
    }
    if (session.status === 'stalled') {
      session = await this.client.resume(session.id);
      return this.client.heartbeat(session.id, {});
    }
    if (session.status === 'active') {
      return session;
    }
    if (session.status === 'resuming' || session.status === 'retrying') {
      return this.client.heartbeat(session.id, {});
    }
    throw new Error(`cannot start download from '${session.status}' state`);
  }

  private async partSize(partPath: string): Promise<number> {
    try {
      const stat = await fsp.stat(partPath);
      return stat.size;
    } catch {
      return 0;
    }
  }
}
