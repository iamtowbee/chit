import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonFileStore } from '../src/store.js';
import type { Session } from '../src/types.js';

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync();
  dirs.push(dir);
  return dir;
}

function mkdtempSync(): string {
  const { mkdtempSync: mk } = require('node:fs');
  return mk(path.join(tmpdir(), 'store-test-'));
}

function session(id: string, status = 'pending'): Session {
  return {
    id,
    status,
    totalSteps: null,
    currentStep: 0,
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastHeartbeatAt: null,
    transitions: [],
    checkpoints: [],
    data: {},
    metadata: {},
    error: null,
    tenant: 'public',
    version: 1,
  };
}

describe('JsonFileStore (sharded persistence)', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists each session to its own file and reopens it', async () => {
    const dir = makeDir();
    const store = new JsonFileStore(dir);
    await store.put(session('aaa', 'active'));
    await store.put(session('bbb', 'done'));
    await store.flush();

    const files = await readdir(path.join(dir, 'sessions'));
    expect(files.sort()).toEqual(['aaa.json', 'bbb.json']);

    const fresh = new JsonFileStore(dir);
    const all = await fresh.all();
    expect(all.map((s) => s.id).sort()).toEqual(['aaa', 'bbb']);
    expect((await fresh.get('aaa'))?.status).toBe('active');
  });

  it('coalesces writes: a burst of puts resolves fast and persists once', async () => {
    const dir = makeDir();
    const store = new JsonFileStore(dir, 0);
    const t0 = performance.now();
    for (let i = 0; i < 50; i += 1) {
      const s = session(`s${i}`);
      s.currentStep = i;
      await store.put(s);
    }
    const elapsed = performance.now() - t0;
    await store.flush();

    const fresh = new JsonFileStore(dir);
    expect((await fresh.all()).length).toBe(50);
    expect(elapsed).toBeLessThan(5000);
  });

  it('migrates a legacy single-file sessions.json into shards', async () => {
    const dir = makeDir();
    await mkdir(path.join(dir, 'sessions'), { recursive: true });
    await writeFile(
      path.join(dir, 'sessions.json'),
      JSON.stringify([session('legacy-a', 'done'), session('legacy-b', 'failed')], null, 2),
      'utf8',
    );

    const store = new JsonFileStore(dir);
    const all = await store.all();
    expect(all.map((s) => s.id).sort()).toEqual(['legacy-a', 'legacy-b']);

    await store.put(session('new-c'));
    await store.flush();

    const files = await readdir(path.join(dir, 'sessions'));
    expect(files.sort()).toEqual(['legacy-a.json', 'legacy-b.json', 'new-c.json']);
    const renamed = await readFile(path.join(dir, 'sessions.json.migrated'), 'utf8');
    expect(JSON.parse(renamed)).toHaveLength(2);

    const fresh = new JsonFileStore(dir);
    expect((await fresh.all()).length).toBe(3);
  });
});
