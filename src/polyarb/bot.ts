import { pathToFileURL } from 'node:url';
import type { ContinueClient } from '../client.js';
import type { Session } from '../types.js';
import { engine } from './engine.js';
import { createExecutor, placeOpportunity, SimExecutor } from './execute.js';
import { HttpPolyClient, type MarketDataSource } from './polyclient.js';
import { Simulator } from './simulator.js';
import type { Opportunity } from './types.js';

export interface PolyarbOptions {
  client: ContinueClient;
  mode: 'sim' | 'live';
  iterations: number;
  intervalMs: number;
  minReturn: number;
  seed?: number;
  /** Simulate fills (sim mode) or place real orders (live mode, needs creds). */
  trade?: boolean;
  /** Shares to buy per leg of a detected opportunity. */
  size?: number;
  sessionId?: string;
  log?: (message: string) => void;
  /** Test hook: invoked after each iteration's heartbeat. */
  onIteration?: (iteration: number) => void | Promise<void>;
}

export interface PolyarbRun {
  session: Session;
  found: number;
}

/**
 * A Polymarket arbitrage bot driven by a Continue session: every scan
 * iteration is a heartbeat checkpoint, so interrupting and re-running with
 * `--session <id>` continues from the exact iteration it stopped at.
 */
export async function runPolyarb(options: PolyarbOptions): Promise<PolyarbRun> {
  const log = options.log ?? (() => undefined);
  const dataSource = createDataSource(options);
  const executor =
    options.trade === true
      ? (options.mode === 'live' ? createExecutor() : new SimExecutor())
      : null;
  if (options.trade === true && options.mode === 'live' && !executor) {
    log('no POLYMARKET_* credentials set — running scan only');
  }

  let session = options.sessionId
    ? await options.client.get(options.sessionId)
    : await options.client.create({
        metadata: {
          app: 'polyarb',
          mode: options.mode,
          minReturn: options.minReturn,
          trade: Boolean(options.trade),
        },
      });

  if (session.status === 'done') {
    log(`session ${session.id} is already done`);
    return { session, found: 0 };
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    throw new Error(`session ${session.id} is ${session.status}: ${session.error ?? ''}`);
  }

  const checkpoints = session.checkpoints;
  const last = checkpoints[checkpoints.length - 1];
  const completed = last ? last.step : 0;
  session = await wake(options.client, session);
  log(`scan session ${session.id} continuing at iteration ${completed + 1}/${options.iterations}`);

  let found = 0;
  for (let iteration = completed + 1; iteration <= options.iterations; iteration += 1) {
    const markets = await dataSource.next();
    const opportunities = engine.detect(markets, { minReturn: options.minReturn });
    found += opportunities.length;

    let trades: string[] = [];
    if (executor && opportunities.length > 0) {
      for (const opportunity of opportunities.slice(0, 3)) {
        const fills = await placeOpportunity(executor, opportunity, options.size ?? 100);
        trades.push(
          `${opportunity.type} @ ${(opportunity.netReturn * 100).toFixed(2)}% → ${fills
            .map((fill) => fill.note)
            .join('; ')}`,
        );
      }
    }

    session = await options.client.heartbeat(session.id, {
      step: iteration,
      progress: iteration / options.iterations,
      data: {
        iteration,
        markets: markets.length,
        opportunities: opportunities.slice(0, 5),
        bestReturn: opportunities[0]?.netReturn ?? null,
        trades,
      },
    });

    logTop(log, iteration, opportunities);
    if (trades.length > 0) log(trades.join('\n'));

    if (options.onIteration) {
      await options.onIteration(iteration);
    }

    if (iteration < options.iterations) {
      await sleep(options.intervalMs);
    }
  }

  session = await options.client.complete(session.id, {
    iterations: options.iterations,
    opportunitiesFound: found,
  });
  session = await options.client.finalize(session.id);
  return { session, found };
}

function createDataSource(options: PolyarbOptions): MarketDataSource {
  if (options.mode === 'live') {
    return new HttpPolyClient();
  }
  return new Simulator({ seed: options.seed ?? 1 });
}

function logTop(
  log: (message: string) => void,
  iteration: number,
  opportunities: Opportunity[],
): void {
  if (opportunities.length === 0) {
    log(`iter ${iteration}: no arbitrage`);
    return;
  }
  for (const opportunity of opportunities.slice(0, 3)) {
    log(
      `iter ${iteration}: ${opportunity.type} return ${(opportunity.netReturn * 100).toFixed(2)}% — ${opportunity.note}`,
    );
  }
}

/** Move a processable session into `active` using valid transitions. */
async function wake(client: ContinueClient, session: Session): Promise<Session> {
  if (session.status === 'pending') {
    session = await client.queue(session.id);
    return client.start(session.id);
  }
  if (session.status === 'queued') {
    return client.start(session.id);
  }
  if (session.status === 'stalled') {
    session = await client.resume(session.id);
    return client.heartbeat(session.id, {});
  }
  if (session.status === 'active') {
    return session;
  }
  if (session.status === 'resuming' || session.status === 'retrying') {
    return client.heartbeat(session.id, {});
  }
  throw new Error(`cannot start scan from '${session.status}' state`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): Map<string, string> {
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.get('mode') === 'live' ? 'live' : 'sim';
  const iterations = Number(args.get('iterations') ?? 8);
  const intervalMs = Number(args.get('interval-ms') ?? 1500);
  const minReturn = Number(args.get('min-return') ?? 0.005);
  const seed = args.get('seed') ? Number(args.get('seed')) : undefined;
  const trade = args.get('trade') === 'true';
  const size = args.get('size') ? Number(args.get('size')) : undefined;
  const sessionId = args.get('session');

  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('--iterations must be a positive integer');
  }

  const baseUrl = process.env.CONTINUE_BASE_URL ?? 'http://127.0.0.1:3001';
  const { ContinueClient } = await import('../client.js');
  const client = new ContinueClient({ baseUrl });

  const { session, found } = await runPolyarb({
    client,
    mode,
    iterations,
    intervalMs,
    minReturn,
    seed,
    trade,
    size,
    sessionId,
    log: (message) => console.log(`[polyarb] ${message}`),
  });

  console.log(
    `\nsession ${session.id}: ${session.status} — ${found} opportunities across ${iterations} iterations`,
  );
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
