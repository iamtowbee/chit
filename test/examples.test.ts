import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ContinueClient } from '../src/client.js';
import { JsonFileStore } from '../src/store.js';
import { runAgent } from '../examples/agent/runner.js';
import { runFileWorker } from '../examples/fileworker/worker.js';

let dataDir: string;
let workDir: string;
let server: http.Server;
let client: ContinueClient;
let store: JsonFileStore;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'continue-examples-data-'));
  workDir = await mkdtemp(path.join(os.tmpdir(), 'continue-examples-work-'));
  store = new JsonFileStore(dataDir);
  const { app } = createApp({ store });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  client = new ContinueClient({ baseUrl: `http://127.0.0.1:${port}` });
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await store.flush();
  await rm(dataDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

async function seedFiles(names: string[]): Promise<{ input: string; output: string }> {
  const input = path.join(workDir, 'in');
  const output = path.join(workDir, 'out');
  await mkdir(input, { recursive: true });
  await mkdir(output, { recursive: true });
  for (const name of names) {
    await mkdir(path.dirname(path.join(input, name)), { recursive: true });
    await writeFile(path.join(input, name), `hello ${name}\n`, 'utf8');
  }
  return { input, output };
}

describe('fileworker example', () => {
  it('processes every file and completes', async () => {
    const { input, output } = await seedFiles(['a.txt', 'b.txt', 'c.txt']);
    const session = await runFileWorker({ inputDir: input, outputDir: output, client });

    expect(session.status).toBe('done');
    expect(session.currentStep).toBe(3);
    expect(session.totalSteps).toBe(3);

    const result = await readFile(path.join(output, 'a.txt'), 'utf8');
    expect(result).toContain('HELLO A.TXT');
  });

  it('recovers a transient failure via stall -> retry -> active', async () => {
    const { input, output } = await seedFiles(['a.txt', 'b.txt']);
    const failOn = new Set(['b.txt']);
    const session = await runFileWorker({
      inputDir: input,
      outputDir: output,
      client,
      failOn,
      maxAttempts: 3,
    });

    expect(session.status).toBe('done');
    expect(session.attempts).toBeGreaterThan(0);
    const b = await readFile(path.join(output, 'b.txt'), 'utf8');
    expect(b).toContain('HELLO B.TXT');
  });

  it('resumes from a checkpoint after interruption', async () => {
    const { input, output } = await seedFiles(['a.txt', 'b.txt', 'c.txt']);

    const first = await runFileWorker({
      inputDir: input,
      outputDir: output,
      client,
      maxFiles: 1,
    });
    expect(first.status).toBe('paused');
    expect(first.currentStep).toBe(1);

    const second = await runFileWorker({
      inputDir: input,
      outputDir: output,
      client,
      sessionId: first.id,
    });

    expect(second.status).toBe('done');
    expect(second.currentStep).toBe(3);
    expect(second.checkpoints).toHaveLength(3);
    const c = await readFile(path.join(output, 'c.txt'), 'utf8');
    expect(c).toContain('HELLO C.TXT');
  });
});

describe('agent example', () => {
  it('runs all steps and completes with checkpoints', async () => {
    const session = await runAgent({
      task: 'write a brief',
      steps: 4,
      client,
    });

    expect(session.status).toBe('done');
    expect(session.currentStep).toBe(4);
    expect(session.checkpoints).toHaveLength(4);
    const data = session.data as { steps?: number };
    expect(data.steps).toBe(4);
  });

  it('continues from the last checkpoint after a crash', async () => {
    const first = await runAgent({
      task: 'write a brief',
      steps: 5,
      client,
      crashAfter: 2,
    });
    expect(first.status).toBe('paused');
    expect(first.checkpoints).toHaveLength(2);

    const second = await runAgent({
      task: 'write a brief',
      steps: 5,
      client,
      sessionId: first.id,
    });

    expect(second.status).toBe('done');
    expect(second.currentStep).toBe(5);
    expect(second.checkpoints).toHaveLength(5);
    const context = (second.data as { context?: string[] }).context ?? [];
    expect(context).toHaveLength(5);
  });
});
