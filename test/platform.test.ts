import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { JsonFileStore } from '../src/store.js';

let dataDir: string;
let store: JsonFileStore;
let app: ReturnType<typeof createApp>['app'];

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'continue-platform-'));
  store = new JsonFileStore(dataDir);
  app = createApp({ store }).app;
});

afterEach(async () => {
  await store.flush();
  await rm(dataDir, { recursive: true, force: true });
});

async function startedSession(): Promise<string> {
  const created = await request(app).post('/api/sessions').send({});
  const id = created.body.session.id as string;
  await request(app).post(`/api/sessions/${id}/queue`);
  await request(app).post(`/api/sessions/${id}/start`);
  return id;
}

describe('resume-from-checkpoint', () => {
  it('resumes from a specific checkpoint', async () => {
    const id = await startedSession();
    await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 2, progress: 0.4, data: { page: 'a' } });
    const second = await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 3, progress: 0.6, data: { page: 'b' } });
    const checkpointId = second.body.session.checkpoints[0].id as string;
    await request(app).post(`/api/sessions/${id}/pause`);

    const res = await request(app)
      .post(`/api/sessions/${id}/resume`)
      .send({ checkpointId });

    expect(res.body.session.status).toBe('resuming');
    expect(res.body.session.currentStep).toBe(2);
    expect(res.body.session.progress).toBe(0.4);
    expect(res.body.session.data).toEqual({ page: 'a' });
  });

  it('resumes from a step number', async () => {
    const id = await startedSession();
    await request(app)
      .post(`/api/sessions/${id}/heartbeat`)
      .send({ step: 1, data: { page: 'a' } });
    await request(app).post(`/api/sessions/${id}/pause`);

    const res = await request(app)
      .post(`/api/sessions/${id}/resume`)
      .send({ step: 1 });

    expect(res.body.session.status).toBe('resuming');
    expect(res.body.session.currentStep).toBe(1);
    expect(res.body.session.data).toEqual({ page: 'a' });
  });

  it('rejects an unknown checkpoint id', async () => {
    const id = await startedSession();
    await request(app).post(`/api/sessions/${id}/pause`);

    const res = await request(app)
      .post(`/api/sessions/${id}/resume`)
      .send({ checkpointId: 'nope' });
    expect(res.status).toBe(409);
  });

  it('rejects providing both checkpointId and step', async () => {
    const id = await startedSession();
    await request(app).post(`/api/sessions/${id}/pause`);

    const res = await request(app)
      .post(`/api/sessions/${id}/resume`)
      .send({ checkpointId: 'x', step: 1 });
    expect(res.status).toBe(409);
  });
});

describe('pagination', () => {
  async function seed(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const created = await request(app).post('/api/sessions').send({});
      ids.push(created.body.session.id as string);
    }
    return ids;
  }

  it('paginates with limit and offset', async () => {
    const ids = await seed(5);
    const first = await request(app).get('/api/sessions?limit=2&offset=0');
    expect(first.body.sessions).toHaveLength(2);
    expect(first.body.pagination.total).toBe(5);
    expect(first.body.pagination.hasMore).toBe(true);
    expect(first.body.sessions[0].id).toBe(ids[4]);

    const last = await request(app).get('/api/sessions?limit=2&offset=4');
    expect(last.body.sessions).toHaveLength(1);
    expect(last.body.pagination.hasMore).toBe(false);
    expect(last.body.sessions[0].id).toBe(ids[0]);
  });

  it('paginates with a cursor', async () => {
    const ids = await seed(5);
    const page1 = await request(app).get('/api/sessions?limit=2');
    const cursor = page1.body.sessions[1].id as string;
    const page2 = await request(app).get(`/api/sessions?limit=2&cursor=${cursor}`);
    expect(page2.body.sessions).toHaveLength(2);
    expect(page2.body.sessions[0].id).toBe(ids[2]);
  });

  it('clamps limit to a sane range', async () => {
    const ok = await request(app).get('/api/sessions?limit=99999');
    expect(ok.status).toBe(200);
    expect(ok.body.pagination.limit).toBe(100);
  });
});

describe('auth + tenant isolation', () => {
  beforeEach(() => {
    app = createApp({
      store,
      apiKeys: new Map([
        ['sk-alice', 'alice'],
        ['sk-bob', 'bob'],
      ]),
    }).app;
  });

  it('rejects requests without or with invalid keys', async () => {
    const noKey = await request(app).get('/api/sessions');
    expect(noKey.status).toBe(401);

    const badKey = await request(app)
      .get('/api/sessions')
      .set('X-API-Key', 'sk-mallory');
    expect(badKey.status).toBe(401);
  });

  it('keeps health and docs public', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    const docs = await request(app).get('/api/docs');
    expect(docs.status).toBe(200);
  });

  it('isolates sessions per tenant', async () => {
    const created = await request(app)
      .post('/api/sessions')
      .set('X-API-Key', 'sk-alice')
      .send({});
    expect(created.status).toBe(201);
    const aliceId = created.body.session.id as string;
    expect(created.body.session.tenant).toBe('alice');

    const bobList = await request(app)
      .get('/api/sessions')
      .set('X-API-Key', 'sk-bob');
    expect(bobList.body.sessions).toHaveLength(0);

    const aliceList = await request(app)
      .get('/api/sessions')
      .set('X-API-Key', 'sk-alice');
    expect(aliceList.body.sessions).toHaveLength(1);

    const crossGet = await request(app)
      .get(`/api/sessions/${aliceId}`)
      .set('X-API-Key', 'sk-bob');
    expect(crossGet.status).toBe(404);

    const crossAction = await request(app)
      .post(`/api/sessions/${aliceId}/queue`)
      .set('X-API-Key', 'sk-bob');
    expect(crossAction.status).toBe(404);

    const ownAction = await request(app)
      .post(`/api/sessions/${aliceId}/queue`)
      .set('X-API-Key', 'sk-alice');
    expect(ownAction.status).toBe(200);
    expect(ownAction.body.session.status).toBe('queued');
  });

  it('supports Bearer tokens', async () => {
    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer sk-alice');
    expect(res.status).toBe(200);
  });
});

describe('OpenAPI docs', () => {
  it('serves a spec with expected metadata', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toBe('Continue Protocol API');
    expect(res.body.paths['/sessions']).toBeDefined();
    expect(res.body.components.schemas.Session).toBeDefined();
  });

  it('serves an HTML docs page', async () => {
    const res = await request(app).get('/api/docs/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });
});
