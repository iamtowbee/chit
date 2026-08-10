import type { ContinueClient } from '../src/client.js';
import type { Session } from '../src/types.js';

export function getBaseUrl(): string {
  return process.env.CONTINUE_BASE_URL ?? 'http://localhost:3001';
}

export function parseArgs(argv: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      map.set(name, 'true');
    } else {
      map.set(name, next);
      i += 1;
    }
  }
  return map;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wake a freshly-created session into `active` without touching checkpoints. */
export async function ensureStarted(
  client: ContinueClient,
  session: Session,
): Promise<Session> {
  if (session.status === 'pending') {
    session = await client.queue(session.id);
  }
  if (session.status === 'queued') {
    session = await client.start(session.id);
  }
  return session;
}

/** Rewind to a checkpoint step so the API records a paused/stalled -> resuming transition. */
export async function rewind(
  client: ContinueClient,
  session: Session,
  step: number,
): Promise<Session> {
  if (step > 0) {
    return client.resume(session.id, { step });
  }
  return session;
}

export function printSession(session: Session, prefix = 'session'): void {
  console.log(
    `${prefix} ${session.id}: ${session.status} step ${session.currentStep}/${
      session.totalSteps ?? '?'
    } progress ${(session.progress * 100).toFixed(0)}%`,
  );
}
