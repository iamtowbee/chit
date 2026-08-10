import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from './errors.js';
import type { SessionService } from './service.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './service.js';
import { STATUSES, type SessionStatus } from './types.js';

export function createRouter(service: SessionService): Router {
  const router = Router();

  router.post(
    '/sessions',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = readBody(req);
        const idempotencyKey =
          typeof req.get('Idempotency-Key') === 'string'
            ? req.get('Idempotency-Key')!
            : undefined;
        const { session, created } = await service.create(
          body,
          idempotencyKey,
          res.locals.tenant,
        );
        res.status(created ? 201 : 200).json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = asStatus(req.query.status);
      const pagination = {
        limit: parseIntQuery(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
        offset: parseIntQuery(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
        cursor: asStringQuery(req.query.cursor),
      };
      const { sessions, total, hasMore } = await service.list(
        status,
        pagination,
        res.locals.tenant,
      );
      res.json({
        sessions,
        pagination: { total, offset: pagination.offset, limit: pagination.limit, hasMore },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await service.get(req.params.id!, res.locals.tenant);
      res.json({ session });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/sessions/:id/queue',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.queue(req.params.id!, res.locals.tenant);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/start',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.start(req.params.id!, res.locals.tenant);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/heartbeat',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.heartbeat(
          req.params.id!,
          readBody(req),
          res.locals.tenant,
        );
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/checkpoint',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.checkpoint(
          req.params.id!,
          readBody(req),
          res.locals.tenant,
        );
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/resume',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = readBody(req);
        const session = await service.resume(
          req.params.id!,
          {
            checkpointId:
              typeof body.checkpointId === 'string' ? body.checkpointId : undefined,
            step: typeof body.step === 'number' ? body.step : undefined,
          },
          res.locals.tenant,
        );
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/retry',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.retry(req.params.id!, res.locals.tenant);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/pause',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.pause(req.params.id!, res.locals.tenant);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/stall',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.stall(req.params.id!, res.locals.tenant);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/complete',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = readBody(req);
        const session = await service.complete(
          req.params.id!,
          body.data,
          res.locals.tenant,
        );
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/finalize',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await service.finalize(req.params.id!, res.locals.tenant);
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/cancel',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = readBody(req);
        const reason = typeof body.reason === 'string' ? body.reason : undefined;
        const session = await service.cancel(
          req.params.id!,
          reason,
          res.locals.tenant,
        );
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/sessions/:id/fail',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = readBody(req);
        if (typeof body.error !== 'string' || body.error.length === 0) {
          return next(new HttpError(400, 'error is required'));
        }
        const session = await service.fail(
          req.params.id!,
          body.error,
          res.locals.tenant,
        );
        res.json({ session });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/watchdog', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stalled = await service.runWatchdog();
      res.json({ stalled });
    } catch (err) {
      next(err);
    }
  });

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'continue-protocol' });
  });

  router.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = await service.getMetrics();
      res.json({ metrics });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function readBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function asStatus(value: unknown): SessionStatus | undefined {
  if (value === undefined) return undefined;
  const raw = String(value);
  if (!STATUSES.includes(raw as SessionStatus)) {
    throw new HttpError(400, `invalid status '${raw}'`);
  }
  return raw as SessionStatus;
}

function parseIntQuery(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, 'pagination values must be integers');
  }
  return Math.max(min, Math.min(max, parsed));
}

function asStringQuery(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
