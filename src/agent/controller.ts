import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ContinueClient } from '../client.js';
import { HttpError } from '../errors.js';
import { runAgent, type AgentSpec, type AgentStage } from '../agent.js';

export interface AgentRunInput {
  sourceUrl: string;
  filename?: string;
  mode?: 'sim' | 'live';
  iterations?: number;
  intervalMs?: number;
  minReturn?: number;
  seed?: number;
  sessionId?: string;
}

export type RunStatus = 'running' | 'done' | 'stopped' | 'error';

/** Check the session status for external pauses this often (per isStopped call). */
const STATUS_POLL_EVERY = 5;

export interface AgentRunRecord {
  id: string;
  sessionId: string;
  filename: string;
  stage: AgentStage;
  status: RunStatus;
  mode: 'sim' | 'live';
  iterations: number;
  found: number;
  bytes: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/**
 * Runs Chit Agents on the platform. Each run is one Continue session that
 * downloads the source, scans for arbitrage, and reports — so stopping and
 * restarting a run resumes from the exact byte or iteration it stopped at.
 */
export class AgentController {
  private readonly runs = new Map<string, AgentRunRecord>();
  private readonly aborted = new Set<string>();
  private readonly log: (message: string) => void;

  constructor(
    private readonly client: ContinueClient,
    private readonly downloadDir: string,
    log?: (message: string) => void,
  ) {
    this.log = log ?? (() => undefined);
  }

  list(): AgentRunRecord[] {
    return [...this.runs.values()].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }

  async start(input: AgentRunInput): Promise<AgentRunRecord> {
    const id = randomUUID();
    const mode = input.mode === 'live' ? 'live' : 'sim';
    const iterations = input.iterations ?? 10;
    const filename = input.filename?.trim() || deriveFilename(input.sourceUrl);

    const sessionId =
      input.sessionId ??
      (
        await this.client.create({
          metadata: {
            app: 'agent',
            sourceUrl: input.sourceUrl,
            filename,
            mode,
            iterations,
          },
        })
      ).id;

    const record: AgentRunRecord = {
      id,
      sessionId,
      filename,
      stage: 'download',
      status: 'running',
      mode,
      iterations,
      found: 0,
      bytes: 0,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(id, record);

    let statusPoll = 0;

    const spec: AgentSpec = {
      sourceUrl: input.sourceUrl,
      filename,
      mode,
      iterations,
      intervalMs: input.intervalMs ?? 500,
      minReturn: input.minReturn ?? 0.005,
    };
    if (input.seed !== undefined) spec.seed = input.seed;

    runAgent({
      client: this.client,
      downloadDir: this.downloadDir,
      spec,
      sessionId,
      callbacks: {
        log: (message) => this.log(`[agent ${id}] ${message}`),
        onProgress: (progress) => {
          record.stage = progress.stage;
          if (progress.offset !== undefined) record.bytes = progress.offset;
          if (progress.file) record.bytes = progress.file.bytes;
          if (progress.found !== undefined) record.found = progress.found;
        },
        isStopped: async () => {
          if (this.aborted.has(id)) return true;
          statusPoll += 1;
          if (statusPoll % STATUS_POLL_EVERY !== 0) return false;
          const fresh = await this.client.get(sessionId).catch(() => null);
          return fresh
            ? fresh.status === 'paused' || fresh.status === 'cancelled'
            : false;
        },
      },
    })
      .then((result) => {
        this.aborted.delete(id);
        record.stage = 'done';
        record.status = 'done';
        record.found = result.found;
        record.bytes = result.file.bytes;
        record.finishedAt = new Date().toISOString();
        this.log(`[agent ${id}] done — ${result.found} opportunities, ${result.file.bytes} bytes`);
      })
      .catch((err: unknown) => {
        this.aborted.delete(id);
        if (record.status === 'stopped') {
          record.finishedAt = new Date().toISOString();
          return;
        }
        record.status = 'error';
        record.error = err instanceof Error ? err.message : String(err);
        record.finishedAt = new Date().toISOString();
        this.log(`[agent ${id}] error — ${record.error}`);
      });

    return record;
  }

  async stop(runId: string): Promise<AgentRunRecord> {
    const record = this.runs.get(runId);
    if (!record) throw new HttpError(404, 'run not found');
    if (record.status !== 'running') return record;
    this.aborted.add(runId);
    await this.client.pause(record.sessionId);
    record.status = 'stopped';
    record.finishedAt = new Date().toISOString();
    return record;
  }

  router(): express.Router {
    const router = express.Router();
    router.get('/runs', (_req: Request, res: Response) => {
      res.json({ runs: this.list() });
    });

    router.post(
      '/runs',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const body = (req.body ?? {}) as Partial<AgentRunInput>;
          const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';
          if (!/^https?:\/\//i.test(sourceUrl)) {
            throw new HttpError(400, 'sourceUrl must be an http(s) URL');
          }
          const iterations = Number(body.iterations ?? 10);
          if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000) {
            throw new HttpError(400, 'iterations must be an integer 1..100000');
          }
          const record = await this.start({
            sourceUrl,
            filename: body.filename,
            mode: body.mode,
            iterations,
            intervalMs: body.intervalMs,
            minReturn: body.minReturn,
            seed: body.seed,
            sessionId: body.sessionId,
          });
          res.status(201).json({ run: record });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/runs/:id/stop',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const record = await this.stop(req.params.id!);
          res.json({ run: record });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  }
}

function deriveFilename(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const base = path.basename(url.pathname);
    if (base && base !== '/') return base;
    return url.hostname || 'data';
  } catch {
    return 'data';
  }
}
