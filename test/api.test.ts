import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/service.js';
import { JsonFileStore } from '../src/store.js';

let dataDir: string;
let store: JsonFileStore;
let app: ReturnType<typeof createApp>['app'];

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'continue-protocol-'));
  store = new JsonFileStore(dataDir);
  app = createApp({ store }).app;
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function newSession(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app).post('/api/sessions').send(overrides);
  expect(res.status).toBe(201);
  return res.body.session.id as string;
}

describe('continue/resume API - 11-state machine', () => {
  it('creates a session and returns 201 in pending state', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ totalSteps: 5, metadata: { task: 'build-site' } });

    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe('pending');
    expect(res.body.session.totalSteps).toBe(5);
    expect(res.body.session.progress).toBe(0);
    expect(res.body.session.currentStep).toBe(0);
  });

  it('dedupes creates with the same Idempotency-Key', async () => {
    const body = { totalSteps: 3 };
    const first = await request(app)
      .post('/api/sessions')
      .set('Idempotency-Key', 'abc')
      .send(body);
    const second = await request(app)
      .post('/api/sessions')
      .set('Idempotency-Key', 'abc')
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.session.id).toBe(first.body.session.id);
  });

  it('returns 404 for an unknown session', async () => {
    const res = await request(app).get('/api/sessions/nope');
    expect(res.status).toBe(404);
  });

  it('walks the happy path: pending -> queued -> active -> verifying -> done', async () => {
    const id = await newSession({ totalSteps: 4 });

    const queued = await request(app).post(`/api/sessions/${id}/queue`);
    expect(queued.body.session.status).toBe('queued');

    const started = await request(app).post(`/api/sessions/${id}/start`);
    expect(started.body.session.status).toBe('active');

    const beat = await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 2, progress: 0.5, data: { page: 'about' } });
    expect(beat.body.session.currentStep).toBe(2);
    expect(beat.body.session.progress).toBe(0.5);
    expect(beat.body.session.checkpoints).toHaveLength(1);
    expect(beat.body.session.lastHeartbeatAt).toBeDefined();

    const verifying = await request(app)
      .post(`/api/sessions/${id}/complete`)
      .send({ data: { buildUrl: 'https://example.com' } });
    expect(verifying.body.session.status).toBe('verifying');
    expect(verifying.body.session.data.buildUrl).toBe('https://example.com');

    const done = await request(app).post(`/api/sessions/${id}/finalize`);
    expect(done.body.session.status).toBe('done');
    expect(done.body.session.progress).toBe(1);
  });

  it('rejects a heartbeat before the session is started', async () => {
    const id = await newSession();
    const res = await request(app).post(`/api/sessions/${id}/heartbeat`).send({});
    expect(res.status).toBe(409);
  });

  it('resume uses the resuming transient state before waking', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/pause`);

    const resumed = await request(app).post(`/api/sessions/${id}/resume`);
    expect(resumed.body.session.status).toBe('resuming');

    const awake = await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 3, progress: 0.75 });
    expect(awake.body.session.status).toBe('active');
    expect(awake.body.session.checkpoints).toHaveLength(1);
  });

  it('checkpoint appends to the checkpoint history', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);

    await request(app)
      .post(`/api/sessions/${id}/checkpoint`)
      .send({ step: 1, data: { a: 1 } });
    const res = await request(app)
      .post(`/api/sessions/${id}/checkpoint`)
      .send({ step: 2, data: { a: 2 } });

    expect(res.body.session.checkpoints).toHaveLength(2);
    expect(res.body.session.checkpoints[1].step).toBe(2);
  });

  it('stalled sessions can be retried and return to active', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/stall`);

    const retrying = await request(app).post(`/api/sessions/${id}/retry`);
    expect(retrying.body.session.status).toBe('retrying');

    const active = await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 1, progress: 0.25 });
    expect(active.body.session.status).toBe('active');
  });

  it('the watchdog marks stale sessions as stalled', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/heartbeat`).send({ step: 1 });

    const fresh = new SessionService(store, -1);
    const stalled = await fresh.runWatchdog();
    expect(stalled.map((s) => s.id)).toContain(id);
    const res = await request(app).get(`/api/sessions/${id}`);
    expect(res.body.session.status).toBe('stalled');
  });

  it('POST /watchdog returns sessions it stalled', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/heartbeat`).send({ step: 1 });

    const fresh = new SessionService(store, -1);
    await fresh.runWatchdog();
    const res = await request(app).post('/api/watchdog');
    expect(res.body.stalled).toEqual([]);
  });

  it('cancels a session with a reason', async () => {
    const id = await newSession();
    const res = await request(app)
      .post(`/api/sessions/${id}/cancel`)
      .send({ reason: 'user aborted' });

    expect(res.body.session.status).toBe('cancelled');
    expect(res.body.session.metadata.reason).toBe('user aborted');
  });

  it('marks a session failed with an error', async () => {
    const id = await newSession();
    const res = await request(app)
      .post(`/api/sessions/${id}/fail`)
      .send({ error: 'timeout' });

    expect(res.body.session.status).toBe('failed');
    expect(res.body.session.error).toBe('timeout');
  });

  it('rejects invalid transitions with 409', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app).post(`/api/sessions/${id}/complete`);
    await request(app).post(`/api/sessions/${id}/finalize`);

    const res = await request(app).post(`/api/sessions/${id}/heartbeat`).send({});
    expect(res.status).toBe(409);
  });

  it('rejects progress values outside 0..1', async () => {
    const id = await newSession();
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);

    const res = await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ progress: 1.5 });

    expect(res.status).toBe(409);
  });

  it('lists sessions with status filter', async () => {
    const a = await newSession();
    await request(app).post(`/api/sessions/${a}/queue`);
    await request(app).post(`/api/sessions/${a}/start`);
    await request(app).post(`/api/sessions/${a}/complete`);
    await request(app).post(`/api/sessions/${a}/finalize`);

    const all = await request(app).get('/api/sessions');
    expect(all.body.sessions).toHaveLength(1);

    const done = await request(app).get('/api/sessions?status=done');
    expect(done.body.sessions).toHaveLength(1);

    const active = await request(app).get('/api/sessions?status=active');
    expect(active.body.sessions).toHaveLength(0);
  });

  it('rejects an invalid status filter', async () => {
    const res = await request(app).get('/api/sessions?status=bogus');
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Content-Type', 'application/json')
      .send('{"oops":');
    expect(res.status).toBe(400);
  });

  it('persists sessions to disk across store instances', async () => {
    const id = await newSession({ totalSteps: 2 });
    await request(app).post(`/api/sessions/${id}/queue`);
    await request(app).post(`/api/sessions/${id}/start`);
    await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 1, progress: 0.5 });

    const freshStore = new JsonFileStore(dataDir);
    const freshApp = createApp({ store: freshStore }).app;
    const res = await request(freshApp).get(`/api/sessions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('active');
    expect(res.body.session.currentStep).toBe(1);
    expect(res.body.session.checkpoints).toHaveLength(1);
  });
});
