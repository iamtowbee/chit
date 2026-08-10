import { randomUUID } from 'node:crypto';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ContinueClient } from '../client.js';
import { HttpError } from '../errors.js';
import { runPolyarb, type PolyarbOptions } from './bot.js';
import type { Opportunity } from './types.js';

export interface ScanStartInput {
  mode: 'sim' | 'live';
  iterations: number;
  intervalMs?: number;
  minReturn?: number;
  seed?: number;
  trade?: boolean;
  size?: number;
  sessionId?: string;
}

export type ScanStatus = 'running' | 'done' | 'stopped' | 'error';

export interface ScanRecord {
  id: string;
  sessionId: string;
  mode: 'sim' | 'live';
  status: ScanStatus;
  iterations: number;
  found: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/**
 * Manages Polyarb scans inside the unified platform: each scan runs the
 * Continue-session-driven bot (so it is checkpointed and resumable), while the
 * controller keeps an in-memory registry of active and finished scans for the
 * UI and REST endpoints.
 */
export class PolyarbController {
  private readonly scans = new Map<string, ScanRecord>();
  private readonly log: (message: string) => void;

  constructor(
    private readonly client: ContinueClient,
    log?: (message: string) => void,
  ) {
    this.log = log ?? (() => undefined);
  }

  list(): ScanRecord[] {
    return [...this.scans.values()].sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt),
    );
  }

  async start(input: ScanStartInput): Promise<ScanRecord> {
    const id = randomUUID();
    const sessionId =
      input.sessionId ??
      (
        await this.client.create({
          metadata: {
            app: 'polyarb',
            mode: input.mode,
            iterations: input.iterations,
            minReturn: input.minReturn ?? 0.005,
            trade: Boolean(input.trade),
          },
        })
      ).id;
    const record: ScanRecord = {
      id,
      sessionId,
      mode: input.mode,
      status: 'running',
      iterations: input.iterations,
      found: 0,
      startedAt: new Date().toISOString(),
    };
    this.scans.set(id, record);

    const options: PolyarbOptions = {
      client: this.client,
      mode: input.mode,
      iterations: input.iterations,
      intervalMs: input.intervalMs ?? 1000,
      minReturn: input.minReturn ?? 0.005,
      trade: Boolean(input.trade),
      size: input.size ?? 100,
      log: (message) => this.log(`[polyarb ${id}] ${message}`),
      onFound: (_iteration: number, opportunities: Opportunity[]) => {
        record.found += opportunities.length;
      },
    };
    if (input.seed !== undefined) options.seed = input.seed;
    options.sessionId = sessionId;

    runPolyarb(options)
      .then((result) => {
        record.sessionId = result.session.id;
        record.status = 'done';
        record.finishedAt = new Date().toISOString();
        this.log(`[polyarb ${id}] done — ${result.found} opportunities`);
      })
      .catch((err: unknown) => {
        if (record.status === 'stopped') {
          record.finishedAt = new Date().toISOString();
          return;
        }
        record.status = 'error';
        record.error = err instanceof Error ? err.message : String(err);
        record.finishedAt = new Date().toISOString();
        this.log(`[polyarb ${id}] error — ${record.error}`);
      });

    return record;
  }

  async stop(scanId: string): Promise<ScanRecord> {
    const record = this.scans.get(scanId);
    if (!record) throw new HttpError(404, 'scan not found');
    if (record.status !== 'running') return record;
    if (record.sessionId) {
      await this.client.cancel(record.sessionId, 'stopped from platform');
    }
    record.status = 'stopped';
    record.finishedAt = new Date().toISOString();
    return record;
  }

  router(): express.Router {
    const router = express.Router();
    router.get('/scans', (_req: Request, res: Response) => {
      res.json({ scans: this.list() });
    });

    router.post(
      '/scans',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const body = (req.body ?? {}) as Partial<ScanStartInput>;
          const mode = body.mode === 'live' ? 'live' : 'sim';
          const iterations = Number(body.iterations);
          if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000) {
            throw new HttpError(400, 'iterations must be an integer 1..100000');
          }
          const record = await this.start({
            mode,
            iterations,
            intervalMs: body.intervalMs,
            minReturn: body.minReturn,
            seed: body.seed,
            trade: body.trade,
            size: body.size,
            sessionId: body.sessionId,
          });
          res.status(201).json({ scan: record });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/scans/:id/stop',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const record = await this.stop(req.params.id!);
          res.json({ scan: record });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  }
}
