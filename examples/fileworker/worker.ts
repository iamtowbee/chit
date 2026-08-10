import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContinueClient } from '../../src/client.js';
import type { Session } from '../../src/types.js';
import {
  ensureStarted,
  getBaseUrl,
  parseArgs,
  printSession,
  rewind,
} from '../common.js';

export interface FileWorkerOptions {
  inputDir: string;
  outputDir: string;
  client: ContinueClient;
  sessionId?: string;
  maxAttempts?: number;
  /** File names that should fail once (to demonstrate the retry policy). */
  failOn?: Set<string>;
  /** Stop after processing this many files and pause (simulate interruption). */
  maxFiles?: number;
  onFile?: (file: string) => void;
}

export async function runFileWorker(options: FileWorkerOptions): Promise<Session> {
  const files = await listFiles(options.inputDir);
  let session = options.sessionId
    ? await options.client.get(options.sessionId)
    : await options.client.create({
        totalSteps: files.length,
        maxAttempts: options.maxAttempts ?? 3,
        metadata: { input: options.inputDir, output: options.outputDir },
      });

  if (session.status === 'done') {
    console.log(`session ${session.id} is already done — nothing to process`);
    return session;
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    throw new Error(
      `session ${session.id} is ${session.status}: ${session.error ?? 'no reason'}`,
    );
  }

  const done = new Set<string>();
  let lastStep = 0;
  for (const checkpoint of session.checkpoints) {
    const data = checkpoint.data as { file?: string } | null;
    if (data?.file) done.add(data.file);
    if (checkpoint.step > lastStep) lastStep = checkpoint.step;
  }
  const remaining = files.filter((file) => !done.has(file));

  console.log(
    `session ${session.id}: ${files.length} files total, ${done.size} already done, processing ${remaining.length}`,
  );
  if (lastStep > 0) {
    session = await rewind(options.client, session, lastStep);
  }
  session = await ensureStarted(options.client, session);

  const attemptsByFile = new Map<string, number>();
  for (const file of remaining) {
    if (options.maxFiles !== undefined && done.size >= options.maxFiles) {
      session = await options.client.pause(session.id).catch(() => session);
      console.log(
        `[stopped after ${done.size} file(s)] session ${session.id} left paused — resume later with --session ${session.id}`,
      );
      return session;
    }

    const attempts = attemptsByFile.get(file) ?? 0;
    await processWithRetry(file, attempts, options, session);
    done.add(file);

    const output = path.join(options.outputDir, file);
    const stat = await readFile(output, 'utf8').catch(() => '');
    session = await options.client.heartbeat(session.id, {
      step: done.size,
      progress: done.size / files.length,
      data: { file, bytes: stat.length },
    });
    options.onFile?.(file);
  }

  session = await options.client.complete(session.id, { files: files.length });
  session = await options.client.finalize(session.id);
  return session;
}

async function processWithRetry(
  file: string,
  initialAttempts: number,
  options: FileWorkerOptions,
  session: Session,
): Promise<void> {
  let attempt = initialAttempts;
  for (;;) {
    attempt += 1;
    try {
      if (options.failOn?.has(file)) {
        options.failOn.delete(file);
        throw new Error(`injected transient failure for ${file}`);
      }
      await processOne(options.inputDir, options.outputDir, file);
      if (attempt > 1) {
        console.log(`  ${file}: recovered on attempt ${attempt}`);
      }
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (session.maxAttempts !== null && attempt >= session.maxAttempts) {
        await options.client.fail(session.id, `failed ${file}: ${message}`);
        throw new Error(`session ${session.id} failed processing ${file}: ${message}`);
      }
      console.log(`  ${file}: error (${message}) — stalling and retrying`);
      await options.client.stall(session.id);
      await options.client.retry(session.id);
      await options.client.heartbeat(session.id, {});
    }
  }
}

async function processOne(inputDir: string, outputDir: string, file: string): Promise<void> {
  const content = await readFile(path.join(inputDir, file), 'utf8');
  const transformed =
    `// processed by continue-protocol fileworker\n` +
    content
      .split('\n')
      .map((line) => line.toUpperCase())
      .join('\n');
  const target = path.join(outputDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, transformed, 'utf8');
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(path.join(dir, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  await walk('');
  return out.sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = args.get('input');
  const outputDir = args.get('output');
  if (!inputDir || !outputDir) {
    throw new Error('--input and --output directories are required');
  }
  const sessionId = args.get('session');
  const maxAttempts = args.get('max-attempts')
    ? Number(args.get('max-attempts'))
    : 3;
  const failOn = args.get('fail-on')
    ? new Set(args.get('fail-on')!.split(','))
    : undefined;
  const maxFiles = args.get('max-files') ? Number(args.get('max-files')) : undefined;

  const client = new ContinueClient({ baseUrl: getBaseUrl() });
  const session = await runFileWorker({
    inputDir,
    outputDir,
    client,
    sessionId,
    maxAttempts,
    failOn,
    maxFiles,
    onFile: (file) => console.log(`  processed ${file}`),
  });
  printSession(session);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
