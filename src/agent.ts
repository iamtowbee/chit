import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { ContinueClient } from './client.js';
import { downloadRange, StopError } from './downloader.js';
import { engine } from './ollyba/engine.js';
import { HttpPolyClient } from './ollyba/polyclient.js';
import { Simulator } from './ollyba/simulator.js';
import type { Market, Opportunity } from './ollyba/types.js';
import type { Session } from './types.js';

export type AgentStage = 'download' | 'scan' | 'done';

export interface AgentSpec {
  sourceUrl: string;
  filename: string;
  mode: 'sim' | 'live';
  iterations: number;
  intervalMs: number;
  minReturn: number;
  seed?: number;
}

export interface AgentProgress {
  stage: AgentStage;
  offset?: number;
  length?: number | null;
  iteration?: number;
  found?: number;
  opportunities?: Opportunity[];
  file?: { filename: string; bytes: number };
}

export interface AgentCallbacks {
  log?: (message: string) => void;
  onProgress?: (progress: AgentProgress) => void;
  /** Called before each chunk/iteration; return true to stop (pause/cancel). */
  isStopped?: () => Promise<boolean>;
}

export interface AgentResult {
  session: Session;
  found: number;
  file: { filename: string; bytes: number };
  bestReturn: number | null;
}

const MAX_CHUNK_RETRIES = 5;

/**
 * The one feature: a Chit Agent. One Continue session drives three stages —
 * 1. download market/data files (Range engine), 2. scan them for arbitrage
 * (ollyba engine), 3. report. Interrupting resumes from the exact byte or
 * iteration, because every heartbeat is a checkpoint on the same session.
 */
export async function runAgent(options: {
  client: ContinueClient;
  downloadDir: string;
  spec: AgentSpec;
  sessionId?: string;
  callbacks?: AgentCallbacks;
}): Promise<AgentResult> {
  const { client, downloadDir, spec, sessionId } = options;
  const log = options.callbacks?.log ?? (() => undefined);
  const onProgress = options.callbacks?.onProgress ?? (() => undefined);
  const isStopped = options.callbacks?.isStopped ?? (async () => false);

  const metadata = {
    app: 'agent',
    sourceUrl: spec.sourceUrl,
    filename: spec.filename,
    mode: spec.mode,
    iterations: spec.iterations,
    minReturn: spec.minReturn,
  };

  let session = sessionId
    ? await client.get(sessionId)
    : await client.create({ metadata });
  if (session.status === 'done') {
    log(`session ${session.id} is already done`);
    const data = session.data as { file?: { filename: string; bytes: number }; bestReturn?: number | null } | null;
    return {
      session,
      found: 0,
      file: data?.file ?? { filename: spec.filename, bytes: 0 },
      bestReturn: data?.bestReturn ?? null,
    };
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    throw new Error(`session ${session.id} is ${session.status}: ${session.error ?? ''}`);
  }

  session = await wake(client, session);
  const progress = (session.data ?? {}) as {
    stage?: AgentStage;
    offset?: number;
    iteration?: number;
    file?: { filename: string; bytes: number };
  };

  let stage: AgentStage = progress.stage === 'scan' ? 'scan' : 'download';
  const finalPath = path.join(downloadDir, spec.filename);
  let fileBytes = progress.file?.bytes ?? 0;

  if (stage === 'download') {
    await fsp.mkdir(downloadDir, { recursive: true });
    const partPath = path.join(downloadDir, `${spec.filename}.part`);
    let offset = progress.offset ?? (await partSize(partPath));
    log(`stage download: resuming ${spec.filename} at byte ${offset}`);

    session = await client.heartbeat(session.id, {
      step: offset,
      progress: 0,
      data: { stage: 'download', offset, length: null },
    });

    let length: number | null = null;
    let attempts = 0;
    for (;;) {
      attempts += 1;
      try {
        const result = await downloadRange(spec.sourceUrl, partPath, offset, {
          onChunk: async (received, len, etag) => {
            session = await client.heartbeat(session.id, {
              step: received,
              progress: len ? Math.min(1, received / len) : 0,
              data: { stage: 'download', offset: received, length: len, etag },
            });
            onProgress({ stage: 'download', offset: received, length: len });
            if (await isStopped()) throw new StopError('interrupted');
          },
          shouldStop: isStopped,
        });
        length = result.length;
        offset = result.offset;
        break;
      } catch (err) {
        if (err instanceof StopError) throw err;
        offset = await partSize(partPath);
        if (attempts >= MAX_CHUNK_RETRIES) {
          throw new Error(
            `giving up after ${attempts} attempts: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const backoff = 1000 * 2 ** (attempts - 1);
        log(`${spec.filename}: chunk attempt ${attempts} failed, retrying in ${backoff}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    await fsp.rename(partPath, finalPath);
    fileBytes = offset;
    log(`stage download: complete (${offset} bytes)`);
    session = await client.heartbeat(session.id, {
      step: offset,
      progress: 1,
      data: {
        stage: 'scan',
        iteration: 0,
        file: { filename: spec.filename, bytes: fileBytes },
      },
    });
    onProgress({ stage: 'scan', file: { filename: spec.filename, bytes: fileBytes } });
    stage = 'scan';
  }

  const snapshot = await parseSnapshot(finalPath);
  if (snapshot && snapshot.length > 0) {
    log(`using ${snapshot.length} markets from ${spec.filename} for the scan`);
  }

  const dataSource = createDataSource(spec.mode, spec.seed);
  const startIteration = (progress.stage === 'scan' ? (progress.iteration ?? 0) : 0) + 1;
  let found = 0;
  let bestReturn: number | null = null;
  let lastOpportunities: Array<{ type: string; netReturn: number; note: string }> = [];

  log(`stage scan: iterations ${startIteration}/${spec.iterations}`);
  for (let iteration = startIteration; iteration <= spec.iterations; iteration += 1) {
    const markets =
      snapshot && iteration === 1
        ? snapshot
        : await dataSource.next();
    const opportunities = engine.detect(markets, { minReturn: spec.minReturn });
    found += opportunities.length;
    bestReturn = opportunities[0]?.netReturn ?? bestReturn;
    lastOpportunities = opportunities.slice(0, 5).map((opportunity) => ({
      type: opportunity.type,
      netReturn: opportunity.netReturn,
      note: opportunity.note,
    }));

    session = await client.heartbeat(session.id, {
      step: iteration,
      progress: iteration / spec.iterations,
      data: {
        stage: 'scan',
        iteration,
        markets: markets.length,
        opportunities: opportunities.length,
        bestReturn,
        file: { filename: spec.filename, bytes: fileBytes },
      },
    });

    if (opportunities.length === 0) {
      log(`iter ${iteration}: no arbitrage`);
    } else {
      for (const opportunity of opportunities.slice(0, 3)) {
        log(
          `iter ${iteration}: ${opportunity.type} return ${(opportunity.netReturn * 100).toFixed(2)}% — ${opportunity.note}`,
        );
      }
    }

    onProgress({
      stage: 'scan',
      iteration,
      found,
      opportunities,
      file: { filename: spec.filename, bytes: fileBytes },
    });
    if (await isStopped()) throw new StopError('paused');
    if (iteration < spec.iterations) {
      await sleep(spec.intervalMs);
    }
  }

  session = await client.complete(session.id, {
    agent: 'chit',
    stages: ['download', 'scan'],
    file: { filename: spec.filename, bytes: fileBytes },
    iterations: spec.iterations,
    opportunitiesFound: found,
    bestReturn,
    opportunities: lastOpportunities,
  });
  session = await client.finalize(session.id);
  log(`agent ${session.id}: done — ${found} opportunities, ${fileBytes} bytes downloaded`);
  return { session, found, file: { filename: spec.filename, bytes: fileBytes }, bestReturn };
}

function createDataSource(
  mode: AgentSpec['mode'],
  seed?: number,
): { next: () => Promise<Market[]> } {
  if (mode === 'live') {
    return new HttpPolyClient();
  }
  return new Simulator({ seed: seed ?? 1 });
}

/** Parses a downloaded file as a market snapshot: an array of markets or {data|markets:[...]}. */
export async function parseSnapshot(filePath: string): Promise<Market[] | null> {
  let raw: string;
  try {
    raw = await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { data?: unknown; markets?: unknown }).data ??
      (parsed as { markets?: unknown }).markets;
  if (!Array.isArray(list)) return null;
  const markets: Market[] = [];
  for (const entry of list as unknown[]) {
    const market = entry as {
      id?: unknown;
      question?: unknown;
      outcomes?: unknown;
      eventId?: unknown;
    };
    if (
      typeof market?.id !== 'string' ||
      typeof market?.question !== 'string' ||
      !Array.isArray(market.outcomes) ||
      !market.outcomes.every(
        (o) =>
          typeof (o as { name?: unknown }).name === 'string' &&
          typeof (o as { price?: unknown }).price === 'number',
      )
    ) {
      continue;
    }
    markets.push({
      id: market.id,
      eventId: typeof market.eventId === 'string' ? market.eventId : undefined,
      question: market.question,
      outcomes: (market.outcomes as { name: string; price: number; tokenId?: string }[]).map(
        (o) => ({ name: o.name, price: o.price, tokenId: o.tokenId }),
      ),
    });
  }
  return markets.length > 0 ? markets : null;
}

/** Move any processable status into `active` using valid transitions. */
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
  if (session.status === 'paused') {
    session = await client.resume(session.id);
    return client.heartbeat(session.id, {});
  }
  if (session.status === 'active') {
    return session;
  }
  if (session.status === 'resuming' || session.status === 'retrying') {
    return client.heartbeat(session.id, {});
  }
  throw new Error(`cannot start agent from '${session.status}' state`);
}

async function partSize(partPath: string): Promise<number> {
  try {
    const stat = await fsp.stat(partPath);
    return stat.size;
  } catch {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
