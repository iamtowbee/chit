import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from './errors.js';
import type { Store } from './store.js';
import type {
  CreateSessionInput,
  HeartbeatInput,
  ListPagination,
  ListResult,
  ResumeInput,
  Session,
  SessionStatus,
} from './types.js';
import {
  NON_TERMINAL_STATUSES,
  STATUSES,
  TERMINAL_STATUSES,
  WATCHDOG_ELIGIBLE,
} from './types.js';

const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  pending: ['queued', 'verifying', 'cancelled', 'failed'],
  queued: ['active', 'verifying', 'cancelled', 'failed'],
  active: ['paused', 'stalled', 'verifying', 'cancelled', 'failed'],
  paused: ['resuming', 'stalled', 'verifying', 'cancelled', 'failed'],
  resuming: ['active', 'stalled', 'verifying', 'cancelled', 'failed'],
  stalled: ['retrying', 'resuming', 'verifying', 'cancelled', 'failed'],
  retrying: ['active', 'stalled', 'verifying', 'cancelled', 'failed'],
  verifying: ['done', 'cancelled', 'failed'],
  done: [],
  cancelled: [],
  failed: [],
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const PUBLIC_TENANT = 'public';

/** Cap on stored checkpoints per session, keeping the persisted file bounded. */
export const MAX_CHECKPOINTS = Number(process.env.MAX_CHECKPOINTS ?? 500);

export interface WatchdogOptions {
  timeoutMs?: number;
}

export interface WebhookEvent {
  event: 'transition';
  from: SessionStatus;
  to: SessionStatus;
  session: Session;
  at: string;
}

export type WebhookNotifier = (event: WebhookEvent) => void;

export interface Metrics {
  created: number;
  transitions: number;
  fromTo: Record<string, number>;
  terminal: Record<string, number>;
  current: Record<string, number>;
}

export class SessionService {
  private readonly idempotency = new Map<string, string>();
  private readonly metrics: Metrics = {
    created: 0,
    transitions: 0,
    fromTo: {},
    terminal: { done: 0, cancelled: 0, failed: 0 },
    current: {},
  };

  constructor(
    private readonly store: Store,
    private readonly stallTimeoutMs = defaultStallTimeout(),
    private readonly notify: WebhookNotifier = defaultNotifier(),
  ) {}

  async getMetrics(): Promise<Metrics> {
    const current: Record<string, number> = {};
    for (const status of STATUSES) current[status] = 0;
    for (const session of await this.store.all()) {
      current[session.status] = (current[session.status] ?? 0) + 1;
    }
    return { ...this.metrics, current };
  }

  async create(
    input: CreateSessionInput,
    idempotencyKey?: string,
    tenant = PUBLIC_TENANT,
  ): Promise<{ session: Session; created: boolean }> {
    if (idempotencyKey) {
      const existingId = this.idempotency.get(idempotencyKey);
      if (existingId) {
        const existing = await this.require(existingId, tenant);
        if (existing) return { session: existing, created: false };
      }
    }

    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      status: 'pending',
      tenant,
      createdAt: now,
      updatedAt: now,
      lastHeartbeatAt: null,
      currentStep: 0,
      totalSteps: normalizeTotalSteps(input.totalSteps),
      progress: 0,
      data: input.data ?? null,
      checkpoints: [],
      error: null,
      metadata: input.metadata ?? {},
      webhookUrl: normalizeWebhookUrl(input.webhookUrl),
      attempts: 0,
      maxAttempts: normalizeMaxAttempts(input.maxAttempts),
      version: 1,
    };

    await this.store.put(session);
    this.metrics.created += 1;
    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, session.id);
    }
    return { session, created: true };
  }

  async list(
    status?: SessionStatus,
    pagination: ListPagination = {},
    tenant?: string,
  ): Promise<ListResult> {
    await this.runWatchdog();
    const limit = clampLimit(pagination.limit);
    const offset = clampOffset(pagination.offset);

    let all = await this.store.all();
    if (tenant) all = all.filter((s) => s.tenant === tenant);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (status) all = all.filter((s) => s.status === status);

    const total = all.length;
    const cursorIdx = pagination.cursor
      ? all.findIndex((s) => s.id === pagination.cursor)
      : -1;
    const start = pagination.cursor
      ? cursorIdx >= 0
        ? cursorIdx + 1
        : all.length
      : offset;
    const page = all.slice(start, start + limit);
    const hasMore = start + page.length < total;

    return { sessions: page, total, hasMore };
  }

  async get(id: string, tenant?: string): Promise<Session> {
    return this.require(id, tenant);
  }

  async queue(id: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    return this.commit(session, this.transition(session, 'queued'));
  }

  async start(id: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    return this.commit(session, this.transition(session, 'active'));
  }

  async heartbeat(
    id: string,
    input: HeartbeatInput,
    tenant?: string,
  ): Promise<Session> {
    const session = await this.require(id, tenant);
    const current =
      session.status === 'active' ? session : this.transition(session, 'active');
    return this.applyProgress(current, input, true);
  }

  async checkpoint(
    id: string,
    input: HeartbeatInput,
    tenant?: string,
  ): Promise<Session> {
    return this.heartbeat(id, input, tenant);
  }

  async resume(
    id: string,
    input: ResumeInput = {},
    tenant?: string,
  ): Promise<Session> {
    const session = await this.require(id, tenant);
    if (session.status === 'active' || session.status === 'resuming') {
      return session;
    }
    if (input.checkpointId !== undefined && input.step !== undefined) {
      throw new ConflictError('provide either checkpointId or step, not both');
    }
    const next = this.transition(session, 'resuming');
    if (input.checkpointId !== undefined) {
      const checkpoint = session.checkpoints.find(
        (c) => c.id === input.checkpointId,
      );
      if (!checkpoint) {
        throw new ConflictError(
          `checkpoint '${input.checkpointId}' not found`,
        );
      }
      next.currentStep = checkpoint.step;
      next.progress = checkpoint.progress;
      if (checkpoint.data !== null) next.data = checkpoint.data;
    } else if (input.step !== undefined) {
      if (!Number.isInteger(input.step) || input.step < 0) {
        throw new ConflictError('step must be a non-negative integer');
      }
      next.currentStep = input.step;
    }
    return this.commit(session, next);
  }

  async retry(id: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    if (session.status !== 'stalled' && session.status !== 'retrying') {
      throw new ConflictError(
        `cannot retry session in '${session.status}' state`,
      );
    }
    const attempts = session.attempts + 1;
    if (session.maxAttempts !== null && attempts >= session.maxAttempts) {
      const next = this.transition(session, 'failed');
      next.attempts = attempts;
      next.error = `max attempts exceeded (${session.maxAttempts})`;
      return this.commit(session, next);
    }
    const next = this.transition(session, 'retrying');
    next.attempts = attempts;
    return this.commit(session, next);
  }

  async pause(id: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    return this.commit(session, this.transition(session, 'paused'));
  }

  async stall(id: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    if (!WATCHDOG_ELIGIBLE.has(session.status)) {
      throw new ConflictError(
        `cannot stall session in '${session.status}' state`,
      );
    }
    return this.commit(session, this.transition(session, 'stalled'));
  }

  async complete(id: string, data?: unknown, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    if (!NON_TERMINAL_STATUSES.has(session.status)) {
      throw new ConflictError(
        `cannot complete session in '${session.status}' state`,
      );
    }
    const next =
      session.status === 'verifying'
        ? session
        : this.transition(session, 'verifying');
    if (data !== undefined) next.data = data;
    return this.commit(session, next);
  }

  async finalize(id: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    const next = this.transition(session, 'done');
    next.progress = 1;
    return this.commit(session, next);
  }

  async cancel(id: string, reason?: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    const next = this.transition(session, 'cancelled');
    if (reason !== undefined) next.metadata.reason = reason;
    return this.commit(session, next);
  }

  async fail(id: string, error: string, tenant?: string): Promise<Session> {
    const session = await this.require(id, tenant);
    const next = this.transition(session, 'failed');
    next.error = error;
    return this.commit(session, next);
  }

  async runWatchdog(options: WatchdogOptions = {}): Promise<Session[]> {
    const timeoutMs = options.timeoutMs ?? this.stallTimeoutMs;
    const now = Date.now();
    const stalled: Session[] = [];
    for (const session of await this.store.all()) {
      if (
        !WATCHDOG_ELIGIBLE.has(session.status) ||
        session.lastHeartbeatAt === null ||
        session.metadata.app === 'game'
      ) {
        continue;
      }
      const lastBeat = Date.parse(session.lastHeartbeatAt);
      if (Number.isNaN(lastBeat) || now - lastBeat > timeoutMs) {
        const next = this.transition(session, 'stalled');
        await this.store.put(next);
        this.record(session.status, 'stalled');
        stalled.push(next);
      }
    }
    return stalled;
  }

  private async applyProgress(
    session: Session,
    input: HeartbeatInput,
    recordCheckpoint: boolean,
  ): Promise<Session> {
    const next: Session = {
      ...session,
      data: session.data,
      metadata: { ...session.metadata },
    };
    const now = new Date().toISOString();
    next.lastHeartbeatAt = now;
    next.updatedAt = now;

    if (input.step !== undefined) {
      if (!Number.isInteger(input.step) || input.step < 0) {
        throw new ConflictError('step must be a non-negative integer');
      }
      next.currentStep = input.step;
    }
    if (input.progress !== undefined) {
      if (typeof input.progress !== 'number' || input.progress < 0 || input.progress > 1) {
        throw new ConflictError('progress must be a number between 0 and 1');
      }
      next.progress = input.progress;
    }
    if (input.data !== undefined) {
      next.data = input.data;
    }
    if (
      next.totalSteps !== null &&
      next.totalSteps > 0 &&
      next.currentStep > next.totalSteps
    ) {
      next.currentStep = next.totalSteps;
    }

    if (recordCheckpoint) {
      const appended = [
        ...next.checkpoints,
        {
          id: randomUUID(),
          at: now,
          step: next.currentStep,
          progress: next.progress,
          data: input.data !== undefined ? input.data : next.data,
        },
      ];
      const max = MAX_CHECKPOINTS;
      next.checkpoints =
        appended.length > max ? appended.slice(appended.length - max) : appended;
    }

    next.version += 1;
    return this.commit(session, next);
  }

  private transition(session: Session, to: SessionStatus): Session {
    if (session.status === to) return session;
    const allowed = TRANSITIONS[session.status];
    if (!allowed.includes(to)) {
      throw new ConflictError(
        `cannot transition session from '${session.status}' to '${to}'`,
      );
    }
    const next: Session = {
      ...session,
      status: to,
      updatedAt: new Date().toISOString(),
      metadata: { ...session.metadata },
    };
    if (TERMINAL_STATUSES.has(to)) {
      next.lastHeartbeatAt = next.updatedAt;
    }
    next.version += 1;
    return next;
  }

  private async commit(prev: Session, next: Session): Promise<Session> {
    await this.store.put(next);
    if (prev.status !== next.status) {
      this.record(prev.status, next.status);
      this.notify({
        event: 'transition',
        from: prev.status,
        to: next.status,
        session: next,
        at: next.updatedAt,
      });
    }
    if (TERMINAL_STATUSES.has(next.status)) {
      await this.store.flush();
    }
    return next;
  }

  private record(from: SessionStatus, to: SessionStatus): void {
    this.metrics.transitions += 1;
    const key = `${from}->${to}`;
    this.metrics.fromTo[key] = (this.metrics.fromTo[key] ?? 0) + 1;
    if (TERMINAL_STATUSES.has(to)) {
      this.metrics.terminal[to] = (this.metrics.terminal[to] ?? 0) + 1;
    }
  }

  private async require(id: string, tenant?: string): Promise<Session> {
    const session = await this.store.get(id);
    if (!session || (tenant && session.tenant !== tenant)) {
      throw new NotFoundError(`session '${id}' not found`);
    }
    return session;
  }
}

function normalizeTotalSteps(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ConflictError('totalSteps must be a non-negative integer');
  }
  return value;
}

function normalizeMaxAttempts(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConflictError('maxAttempts must be a positive integer');
  }
  return value;
}

function normalizeWebhookUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ConflictError('webhookUrl must be a string');
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new ConflictError('webhookUrl must be a valid http(s) URL');
  }
  return value;
}

function clampLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

function clampOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function defaultStallTimeout(): number {
  const raw = process.env.STALL_TIMEOUT_MS;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function defaultNotifier(): WebhookNotifier {
  return (event) => {
    const url = event.session.webhookUrl;
    if (!url) return;
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => {
      // Webhook delivery is best-effort and must never fail the transition.
    });
  };
}
