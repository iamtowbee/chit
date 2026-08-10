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
import { createLLM, type LLM } from './llm.js';

export interface RunAgentOptions {
  task: string;
  steps: number;
  client: ContinueClient;
  sessionId?: string;
  /** Simulate a crash after this many steps: pause + return without completing. */
  crashAfter?: number;
  llm?: LLM;
  onStep?: (step: number, total: number, output: string) => void;
}

export async function runAgent(options: RunAgentOptions): Promise<Session> {
  const llm = options.llm ?? createLLM();
  let session = options.sessionId
    ? await options.client.get(options.sessionId)
    : await options.client.create({
        totalSteps: options.steps,
        metadata: { task: options.task },
      });

  if (session.status === 'done') {
    console.log(`session ${session.id} is already done — nothing to run`);
    return session;
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    throw new Error(
      `session ${session.id} is ${session.status}: ${session.error ?? 'no reason'}`,
    );
  }

  const checkpoints = session.checkpoints;
  const last = checkpoints[checkpoints.length - 1];
  const completed = last ? last.step : 0;

  console.log(
    `resuming session ${session.id} at step ${completed + 1}/${options.steps}`,
  );
  if (completed > 0) {
    session = await rewind(options.client, session, completed);
  }
  session = await ensureStarted(options.client, session);

  const context: string[] = [];
  for (const checkpoint of checkpoints) {
    const data = checkpoint.data as { output?: string } | null;
    if (data?.output) context.push(data.output);
  }

  for (let step = completed + 1; step <= options.steps; step += 1) {
    if (options.crashAfter !== undefined && step > options.crashAfter) {
      session = await options.client.pause(session.id).catch(() => session);
      console.log(
        `[simulated crash after step ${options.crashAfter}] session ${session.id} left paused`,
      );
      return session;
    }

    const prompt = buildPrompt(options.task, step, options.steps, context);
    const output = await llm.generate(prompt);
    context.push(output);
    session = await options.client.heartbeat(session.id, {
      step,
      progress: step / options.steps,
      data: { step, output },
    });
    options.onStep?.(step, options.steps, output);
  }

  session = await options.client.complete(session.id, {
    steps: options.steps,
    context,
  });
  session = await options.client.finalize(session.id);
  return session;
}

function buildPrompt(
  task: string,
  step: number,
  total: number,
  context: string[],
): string {
  const contextBlock =
    context.length > 0 ? `\n\nSo far:\n${context.map((c) => `- ${c}`).join('\n')}` : '';
  return `You are completing a multi-step task in ${total} steps.\nTask: ${task}\n\nProduce the output for step ${step}/${total}.${contextBlock}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const task = args.get('task') ?? 'Write a short research brief';
  const steps = Number(args.get('steps') ?? 5);
  const sessionId = args.get('session');
  const crashAfter = args.get('crash-after')
    ? Number(args.get('crash-after'))
    : undefined;
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('--steps must be a positive integer');
  }

  const client = new ContinueClient({ baseUrl: getBaseUrl() });
  const session = await runAgent({
    task,
    steps,
    client,
    sessionId,
    crashAfter,
    onStep: (step, total, output) => {
      console.log(`  step ${step}/${total}: ${output.slice(0, 90)}`);
    },
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
