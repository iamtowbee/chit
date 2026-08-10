import { createServer as createHttpServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlatform } from '../src/platform.js';

const PAYLOAD = Buffer.from('0123456789'.repeat(64));

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

describe('unified platform', () => {
  let port: number;
  let baseUrl: string;
  let fileServer: Server;
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
    handle.box.start();

    fileServer = createHttpServer((req, res) => {
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-/.exec(range);
        const start = match ? Number(match[1]) : 0;
        res.writeHead(206, {
          'content-range': `bytes ${start}-${PAYLOAD.length - 1}/${PAYLOAD.length}`,
          'content-length': PAYLOAD.length - start,
          'accept-ranges': 'bytes',
        });
        res.end(PAYLOAD.subarray(start));
      } else {
        res.writeHead(200, { 'content-length': PAYLOAD.length });
        res.end(PAYLOAD);
      }
    });
    await new Promise<void>((resolve) => fileServer.listen(0, '127.0.0.1', resolve));
  });

  afterAll(() => {
    handle.box.stop();
    fileServer.close();
  });

  it('serves the unified UI with all three panels', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('Agent Platform for Trading');
    expect(html).toContain('panel-sessions');
    expect(html).toContain('panel-downloads');
    expect(html).toContain('panel-polyarb');
  });

  it('serves the continue API on the same port', async () => {
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    expect(health.ok).toBe(true);

    const created = await (
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ totalSteps: 5, metadata: { app: 'platform-test' } }),
      })
    ).json();
    expect(created.session.status).toBe('pending');

    const queued = await (
      await fetch(`${baseUrl}/api/sessions/${created.session.id}/queue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json();
    expect(queued.session.status).toBe('queued');

    const started = await (
      await fetch(`${baseUrl}/api/sessions/${created.session.id}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json();
    expect(started.session.status).toBe('active');
  });

  it('runs a download end to end on the same port', async () => {
    const fileUrl = `http://127.0.0.1:${(fileServer.address() as { port: number }).port}/blob.bin`;
    const enqueued = await (
      await fetch(`${baseUrl}/downloads/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: fileUrl, filename: 'blob.bin' }),
      })
    ).json();
    const id = enqueued.session.id;
    expect(enqueued.session.status).toBe('queued');

    let done = false;
    for (let i = 0; i < 40 && !done; i += 1) {
      await handle.box.tick();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const list = await (await fetch(`${baseUrl}/downloads/jobs`)).json();
      const job = list.jobs.find((j: { session: { id: string } }) => j.session.id === id);
      done = job && job.session.status === 'done';
    }
    expect(done).toBe(true);

    const file = await fetch(`${baseUrl}/downloads/files/blob.bin`);
    expect(file.status).toBe(200);
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.equals(PAYLOAD)).toBe(true);
  });

  it('runs a polyarb sim scan and reports found opportunities', async () => {
    const started = await (
      await fetch(`${baseUrl}/polyarb/scans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'sim', iterations: 3, intervalMs: 0, seed: 1 }),
      })
    ).json();
    const scanId = started.scan.id;
    expect(started.scan.status).toBe('running');

    let scan = started.scan;
    for (let i = 0; i < 40 && scan.status === 'running'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const list = await (await fetch(`${baseUrl}/polyarb/scans`)).json();
      scan = list.scans.find((s: { id: string }) => s.id === scanId);
    }
    expect(scan.status).toBe('done');
    expect(scan.sessionId).toBeTruthy();
    expect(scan.found).toBeGreaterThanOrEqual(0);
    expect(scan.iterations).toBe(3);

    const sessions = await (await fetch(`${baseUrl}/api/sessions`)).json();
    const polySession = sessions.sessions.find(
      (s: { id: string }) => s.id === scan.sessionId,
    );
    expect(polySession.status).toBe('done');
    expect(polySession.metadata.app).toBe('polyarb');
  });

  it('stops a running polyarb scan', async () => {
    const started = await (
      await fetch(`${baseUrl}/polyarb/scans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'sim', iterations: 5000, intervalMs: 25, seed: 2 }),
      })
    ).json();
    const scanId = started.scan.id;
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stopped = await (
      await fetch(`${baseUrl}/polyarb/scans/${scanId}/stop`, { method: 'POST' })
    ).json();
    expect(stopped.scan.status).toBe('stopped');

    const sessions = await (await fetch(`${baseUrl}/api/sessions`)).json();
    const session = sessions.sessions.find(
      (s: { id: string }) => s.id === stopped.scan.sessionId,
    );
    expect(session.status).toBe('cancelled');
  });

  it('does not let the download box steal sessions from other apps', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ totalSteps: 10, metadata: { app: 'polyarb' } }),
      })
    ).json();
    const id = created.session.id;
    await fetch(`${baseUrl}/api/sessions/${id}/queue`, { method: 'POST' });
    await fetch(`${baseUrl}/api/sessions/${id}/start`, { method: 'POST' });

    await handle.box.tick();
    const session = await (await fetch(`${baseUrl}/api/sessions/${id}`)).json();
    expect(session.session.status).toBe('active');
  });

  it('supports API-key auth on /api and /polyarb when configured', async () => {
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

    const scanNoKey = await fetch(`http://127.0.0.1:${port2}/polyarb/scans`);
    expect(scanNoKey.status).toBe(401);
    h.box.stop();
  });
});
