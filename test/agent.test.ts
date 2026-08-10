import { createServer as createHttpServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAgent, parseSnapshot } from '../src/agent.js';
import { ContinueClient } from '../src/client.js';
import { createApp } from '../src/app.js';

const SNAPSHOT = [
  {
    id: 'm1',
    question: 'Will event X happen?',
    outcomes: [
      { name: 'Yes', price: 0.55 },
      { name: 'No', price: 0.4 },
    ],
  },
  {
    id: 'm2',
    eventId: 'e2',
    question: 'Will Y happen? (A)',
    outcomes: [
      { name: 'Yes', price: 0.62 },
      { name: 'No', price: 0.41 },
    ],
  },
  {
    id: 'm3',
    eventId: 'e2',
    question: 'Will Y happen?',
    outcomes: [
      { name: 'Yes', price: 0.42 },
      { name: 'No', price: 0.52 },
    ],
  },
];

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createHttpServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

describe('parseSnapshot', () => {
  it('parses a plain array of markets', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'snap-'));
    const file = path.join(dir, 's.json');
    await import('node:fs/promises').then((fsp) => fsp.writeFile(file, JSON.stringify(SNAPSHOT)));
    const markets = await parseSnapshot(file);
    expect(markets).not.toBeNull();
    expect(markets!.length).toBe(3);
    expect(markets![0].outcomes).toHaveLength(2);
  });

  it('accepts {data:[...]} and {markets:[...]} wrappers', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'snap-'));
    const fsp = await import('node:fs/promises');
    const a = path.join(dir, 'a.json');
    const b = path.join(dir, 'b.json');
    await fsp.writeFile(a, JSON.stringify({ data: SNAPSHOT }));
    await fsp.writeFile(b, JSON.stringify({ markets: SNAPSHOT }));
    expect((await parseSnapshot(a))!.length).toBe(3);
    expect((await parseSnapshot(b))!.length).toBe(3);
  });

  it('returns null for non-JSON or malformed data', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'snap-'));
    const fsp = await import('node:fs/promises');
    const bad = path.join(dir, 'bad.json');
    await fsp.writeFile(bad, 'not json');
    expect(await parseSnapshot(bad)).toBeNull();
    await fsp.writeFile(bad, JSON.stringify({ hello: 'world' }));
    expect(await parseSnapshot(bad)).toBeNull();
    await fsp.writeFile(bad, JSON.stringify([{ id: 'x' }]));
    expect(await parseSnapshot(bad)).toBeNull();
  });
});

describe('runAgent', () => {
  let apiServer: Server;
  let dataServer: Server;
  let baseUrl: string;
  let fileUrl: string;
  let downloadDir: string;

  beforeAll(async () => {
    const port = await getFreePort();
    const app = createApp({ dataDir: mkdtempSync(path.join(tmpdir(), 'agent-data-')) });
    await new Promise<void>((resolve) => {
      apiServer = createHttpServer(app.app);
      apiServer.listen(port, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${port}`;

    const payload = Buffer.from(JSON.stringify(SNAPSHOT));
    dataServer = createHttpServer((req, res) => {
      const range = req.headers.range;
      if (range) {
        const start = Number(/^bytes=(\d+)-/.exec(range)?.[1] ?? 0);
        res.writeHead(206, {
          'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
          'content-length': payload.length - start,
          'accept-ranges': 'bytes',
        });
        res.end(payload.subarray(start));
      } else {
        res.writeHead(200, { 'content-length': payload.length });
        res.end(payload);
      }
    });
    await new Promise<void>((resolve) => dataServer.listen(0, '127.0.0.1', resolve));
    fileUrl = `http://127.0.0.1:${(dataServer.address() as { port: number }).port}/markets.json`;

    downloadDir = mkdtempSync(path.join(tmpdir(), 'agent-dl-'));
  });

  afterAll(() => {
    apiServer.close();
    dataServer.close();
  });

  it('downloads the source, scans the snapshot, and completes one session', async () => {
    const client = new ContinueClient({ baseUrl });
    const result = await runAgent({
      client,
      downloadDir,
      spec: {
        sourceUrl: fileUrl,
        filename: 'markets.json',
        mode: 'sim',
        iterations: 3,
        intervalMs: 0,
        minReturn: 0.005,
        seed: 1,
      },
    });

    expect(result.session.status).toBe('done');
    expect(result.session.currentStep).toBe(3);
    expect(result.found).toBeGreaterThanOrEqual(1);
    expect(result.file.bytes).toBe(Buffer.byteLength(JSON.stringify(SNAPSHOT)));
    expect((result.session.metadata as { app?: string }).app).toBe('agent');

    const fsp = await import('node:fs/promises');
    const onDisk = JSON.parse(await fsp.readFile(path.join(downloadDir, 'markets.json'), 'utf8'));
    expect(onDisk).toEqual(SNAPSHOT);
  });

  it('resumes from the exact iteration after an interruption', async () => {
    const client = new ContinueClient({ baseUrl });
    let stopRequested = false;
    let firstRunError: unknown = null;

    await runAgent({
      client,
      downloadDir,
      spec: {
        sourceUrl: fileUrl,
        filename: 'markets.json',
        mode: 'sim',
        iterations: 5,
        intervalMs: 0,
        minReturn: 0.005,
        seed: 1,
      },
      callbacks: {
        onProgress: (progress) => {
          if (progress.iteration === 1) stopRequested = true;
        },
        isStopped: async () => stopRequested,
      },
    }).catch((err: unknown) => {
      firstRunError = err;
    });

    expect(firstRunError).toBeTruthy();

    stopRequested = false;
    const sessions = await client.list();
    const sessionId = sessions[0].id;
    const result = await runAgent({
      client,
      downloadDir,
      spec: {
        sourceUrl: fileUrl,
        filename: 'markets.json',
        mode: 'sim',
        iterations: 5,
        intervalMs: 0,
        minReturn: 0.005,
        seed: 1,
      },
      sessionId,
      callbacks: {
        isStopped: async () => false,
      },
    });

    expect(result.session.status).toBe('done');
    expect(result.session.currentStep).toBe(5);
    expect(result.found).toBeGreaterThanOrEqual(1);
    const data = result.session.data as { file?: { bytes?: number } };
    expect(data.file?.bytes ?? 0).toBe(Buffer.byteLength(JSON.stringify(SNAPSHOT)));
  });
});
