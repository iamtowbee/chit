import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ContinueClient } from '../src/client.js';
import { SessionService } from '../src/service.js';
import { JsonFileStore } from '../src/store.js';

let dataDir: string;
let store: JsonFileStore;
let app: ReturnType<typeof createApp>['app'];

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'continue-features-'));
  store = new JsonFileStore(dataDir);
  app = createApp({ store }).app;
});

afterEach(async () => {
  await store.flush();
  await rm(dataDir, { recursive: true, force: true });
});

describe('retry policy', () => {
  it('increments attempts and stays in retrying', async () => {
    const created = await request(app).post('/api/sessions').send({});
    const id = created.body.session.id as string;
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/stall`);

    const res = await request(app).post(`/api/sessions/${id}/retry`);
    expect(res.body.session.status).toBe('retrying');
    expect(res.body.session.attempts).toBe(1);
  });

  it('fails when maxAttempts is exceeded', async () => {
    const created = await request(app)
      .post('/api/sessions')
      .send({ maxAttempts: 2 });
    const id = created.body.session.id as string;
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);

    await request(app).post(`/api/sessions/${id}/stall`);
    await request(app).post(`/api/sessions/${id}/retry`);
    await request(app).post(`/api/sessions/${id}/stall`);
    const res = await request(app).post(`/api/sessions/${id}/retry`);

    expect(res.body.session.status).toBe('failed');
    expect(res.body.session.attempts).toBe(2);
    expect(res.body.session.error).toContain('max attempts exceeded');
  });
});

describe('webhooks', () => {
  let webhook: Server;
  let events: Array<Record<string, unknown>>;
  let webhookUrl: string;

  beforeEach(async () => {
    events = [];
    webhook = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        events.push(JSON.parse(body));
        res.statusCode = 204;
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      webhook.listen(0, '127.0.0.1', resolve);
    });
    const address = webhook.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    webhookUrl = `http://127.0.0.1:${address.port}/hook`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      webhook.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('fires on status changes only', async () => {
    const created = await request(app)
      .post('/api/sessions')
      .send({ webhookUrl });
    const id = created.body.session.id as string;

    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/heartbeat`).send({ step: 1 });
    await request(app).post(`/api/sessions/${id}/complete`);
    await request(app).post(`/api/sessions/${id}/finalize`);

    await waitFor(() => events.length === 4, 2000);

    expect(events.map((e) => `${e.from}->${e.to}`)).toEqual([
      'pending->queued',
      'queued->active',
      'active->verifying',
      'verifying->done',
    ]);
    expect(events[0]).toMatchObject({ event: 'transition' });
  });
});

describe('metrics', () => {
  it('tracks created, transitions, terminal, and current', async () => {
    await request(app).post('/api/sessions').send({});
    const b = await request(app).post('/api/sessions').send({});
    const bId = b.body.session.id as string;
    await request(app).post(`/api/sessions/${bId}/queue`);
    await request(app).post(`/api/sessions/${bId}/start`);
    await request(app).post(`/api/sessions/${bId}/complete`);
    await request(app).post(`/api/sessions/${bId}/finalize`);

    const res = await request(app).get('/api/metrics');
    const m = res.body.metrics;

    expect(m.created).toBe(2);
    expect(m.transitions).toBe(4);
    expect(m.terminal.done).toBe(1);
    expect(m.current.done).toBe(1);
    expect(m.current.pending).toBe(1);
    expect(m.fromTo['pending->queued']).toBe(1);
    expect(m.fromTo['verifying->done']).toBe(1);
  });
});

describe('client SDK', () => {
  it('runs a full lifecycle through ContinueClient', async () => {
    const server = await listen(app);
    try {
      const client = new ContinueClient({ baseUrl: `http://127.0.0.1:${server.port}` });

      const session = await client.create({ totalSteps: 3, metadata: { sdk: true } });
      expect(session.status).toBe('pending');

      await client.queue(session.id);
      await client.start(session.id);
      const active = await client.heartbeat(session.id, { step: 2, progress: 0.66 });
      expect(active.status).toBe('active');
      expect(active.checkpoints).toHaveLength(1);

      await client.pause(session.id);
      const resuming = await client.resume(session.id);
      expect(resuming.status).toBe('resuming');

      const awake = await client.heartbeat(session.id, { step: 3, progress: 1 });
      expect(awake.status).toBe('active');

      await client.complete(session.id);
      const done = await client.finalize(session.id);
      expect(done.status).toBe('done');
      expect(done.progress).toBe(1);

      const list = await client.list('done');
      expect(list.map((s) => s.id)).toContain(session.id);

      const health = await client.health();
      expect(health.ok).toBe(true);
    } finally {
      server.close();
    }
  });

  it('throws a descriptive error on 409', async () => {
    const server = await listen(app);
    try {
      const client = new ContinueClient({ baseUrl: `http://127.0.0.1:${server.port}` });
      const session = await client.create();
      await expect(client.heartbeat(session.id)).rejects.toThrow(/409/);
    } finally {
      server.close();
    }
  });
});

async function listen(app: ReturnType<typeof createApp>['app']): Promise<Server & { port: number }> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return Object.assign(server, { port: address.port });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
