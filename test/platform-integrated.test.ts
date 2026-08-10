import { createServer as createHttpServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlatform } from '../src/platform.js';

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

describe('unified platform — one agent feature', () => {
  let port: number;
  let baseUrl: string;
  let dataServer: Server;
  let handle: ReturnType<typeof createPlatform>;

  beforeAll(async () => {
    port = await getFreePort();
    const root = mkdtempSync(path.join(tmpdir(), 'platform-test-'));
    handle = createPlatform({
      port,
      dataDir: path.join(root, 'data'),
      downloadDir: path.join(root, 'downloads'),
    });
    await new Promise<void>((resolve) => {
      const server = createHttpServer(handle.app);
      server.listen(port, '127.0.0.1', resolve);
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
  });

  afterAll(() => {
    dataServer.close();
  });

  it('serves the single agent UI (no tabs)', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('Agent for Trading');
    expect(html.includes('data-tab')).toBe(false);
  });

  it('serves the session API on the same port', async () => {
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    expect(health.ok).toBe(true);

    const created = await (
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ totalSteps: 5, metadata: { app: 'test' } }),
      })
    ).json();
    expect(created.session.status).toBe('pending');
  });

  it('runs an agent end to end: download, scan the snapshot, report', async () => {
    const sourceUrl = `http://127.0.0.1:${(dataServer.address() as { port: number }).port}/markets.json`;
    const started = await (
      await fetch(`${baseUrl}/agent/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          filename: 'markets.json',
          mode: 'sim',
          iterations: 3,
          intervalMs: 0,
          minReturn: 0.005,
          seed: 1,
        }),
      })
    ).json();
    const runId = started.run.id;
    expect(started.run.status).toBe('running');

    let run = started.run;
    for (let i = 0; i < 60 && run.status === 'running'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const list = await (await fetch(`${baseUrl}/agent/runs`)).json();
      run = list.runs.find((r: { id: string }) => r.id === runId);
    }
    expect(run.status).toBe('done');
    expect(run.stage).toBe('done');
    expect(run.found).toBeGreaterThanOrEqual(1);
    expect(run.bytes).toBe(Buffer.byteLength(JSON.stringify(SNAPSHOT)));

    const sessions = await (await fetch(`${baseUrl}/api/sessions`)).json();
    const session = sessions.sessions.find(
      (s: { id: string }) => s.id === run.sessionId,
    );
    expect(session.status).toBe('done');
    expect(session.metadata.app).toBe('agent');

    const file = await fetch(`${baseUrl}/files/markets.json`);
    expect(file.status).toBe(200);
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(JSON.parse(bytes.toString('utf8'))).toEqual(SNAPSHOT);
  });

  it('stops a running agent and resumes it from its checkpoint', async () => {
    const sourceUrl = `http://127.0.0.1:${(dataServer.address() as { port: number }).port}/markets.json`;
    const started = await (
      await fetch(`${baseUrl}/agent/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          filename: 'markets.json',
          mode: 'sim',
          iterations: 500,
          intervalMs: 25,
          minReturn: 0.005,
          seed: 2,
        }),
      })
    ).json();
    const runId = started.run.id;
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stopped = await (
      await fetch(`${baseUrl}/agent/runs/${runId}/stop`, { method: 'POST' })
    ).json();
    expect(stopped.run.status).toBe('stopped');

    const sessions = await (await fetch(`${baseUrl}/api/sessions`)).json();
    const paused = sessions.sessions.find(
      (s: { id: string }) => s.id === stopped.run.sessionId,
    );
    expect(paused.status).toBe('paused');

    const resumed = await (
      await fetch(`${baseUrl}/agent/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          filename: 'markets.json',
          mode: 'sim',
          iterations: 100,
          intervalMs: 0,
          minReturn: 0.005,
          seed: 2,
          sessionId: stopped.run.sessionId,
        }),
      })
    ).json();
    const resumeId = resumed.run.id;
    let run = resumed.run;
    for (let i = 0; i < 60 && run.status === 'running'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const list = await (await fetch(`${baseUrl}/agent/runs`)).json();
      run = list.runs.find((r: { id: string }) => r.id === resumeId);
    }
    expect(run.status).toBe('done');
    expect(run.sessionId).toBe(stopped.run.sessionId);
  }, 20000);

  it('supports API-key auth on /api and /agent when configured', async () => {
    const port2 = await getFreePort();
    const keys = new Map([['sk-test-123', 'alice']]);
    const h = createPlatform({
      port: port2,
      dataDir: mkdtempSync(path.join(tmpdir(), 'platform-auth-')),
      downloadDir: mkdtempSync(path.join(tmpdir(), 'platform-auth-dl-')),
      apiKeys: keys,
    });
    await new Promise<void>((resolve) => {
      const server = createHttpServer(h.app);
      server.listen(port2, '127.0.0.1', resolve);
    });

    const noKey = await fetch(`http://127.0.0.1:${port2}/api/sessions`);
    expect(noKey.status).toBe(401);

    const withKey = await fetch(`http://127.0.0.1:${port2}/api/sessions`, {
      headers: { 'x-api-key': 'sk-test-123' },
    });
    expect(withKey.status).toBe(200);

    const runsNoKey = await fetch(`http://127.0.0.1:${port2}/agent/runs`);
    expect(runsNoKey.status).toBe(401);
  });
});
