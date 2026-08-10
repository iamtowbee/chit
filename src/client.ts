import type {
  CreateSessionInput,
  HeartbeatInput,
  ListPagination,
  ResumeInput,
  Session,
  SessionStatus,
} from './types.js';

export interface Metrics {
  created: number;
  transitions: number;
  fromTo: Record<string, number>;
  terminal: Record<string, number>;
  current: Record<string, number>;
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}

export class ContinueClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.apiKey = options.apiKey;
  }

  async create(
    input: CreateSessionInput = {},
    idempotencyKey?: string,
  ): Promise<Session> {
    const res = await this.request('POST', '/api/sessions', {
      body: input,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    return (res as { session: Session }).session;
  }

  async get(id: string): Promise<Session> {
    const res = await this.request('GET', `/api/sessions/${id}`);
    return (res as { session: Session }).session;
  }

  async list(status?: SessionStatus, pagination?: ListPagination): Promise<Session[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (pagination) {
      if (pagination.limit !== undefined) params.set('limit', String(pagination.limit));
      if (pagination.offset !== undefined) params.set('offset', String(pagination.offset));
      if (pagination.cursor !== undefined) params.set('cursor', pagination.cursor);
    }
    const qs = params.size > 0 ? `?${params.toString()}` : '';
    const res = await this.request('GET', `/api/sessions${qs}`);
    return (res as { sessions: Session[] }).sessions;
  }

  queue(id: string): Promise<Session> {
    return this.action(id, 'queue');
  }

  start(id: string): Promise<Session> {
    return this.action(id, 'start');
  }

  heartbeat(id: string, input: HeartbeatInput = {}): Promise<Session> {
    return this.action(id, 'heartbeat', input);
  }

  checkpoint(id: string, input: HeartbeatInput = {}): Promise<Session> {
    return this.action(id, 'checkpoint', input);
  }

  resume(id: string, input: ResumeInput = {}): Promise<Session> {
    return this.action(id, 'resume', input);
  }

  retry(id: string): Promise<Session> {
    return this.action(id, 'retry');
  }

  pause(id: string): Promise<Session> {
    return this.action(id, 'pause');
  }

  stall(id: string): Promise<Session> {
    return this.action(id, 'stall');
  }

  complete(id: string, data?: unknown): Promise<Session> {
    return this.action(id, 'complete', data === undefined ? {} : { data });
  }

  finalize(id: string): Promise<Session> {
    return this.action(id, 'finalize');
  }

  cancel(id: string, reason?: string): Promise<Session> {
    return this.action(id, 'cancel', reason === undefined ? {} : { reason });
  }

  fail(id: string, error: string): Promise<Session> {
    return this.action(id, 'fail', { error });
  }

  async watchdog(): Promise<Session[]> {
    const res = await this.request('POST', '/api/watchdog');
    return (res as { stalled: Session[] }).stalled;
  }

  async metrics(): Promise<Metrics> {
    const res = await this.request('GET', '/api/metrics');
    return (res as { metrics: Metrics }).metrics;
  }

  async health(): Promise<{ ok: boolean; service: string }> {
    return this.request('GET', '/api/health') as Promise<{ ok: boolean; service: string }>;
  }

  private async action(
    id: string,
    action: string,
    body: object = {},
  ): Promise<Session> {
    const res = await this.request('POST', `/api/sessions/${id}/${action}`, {
      body,
    });
    return (res as { session: Session }).session;
  }

  private async request(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
      ...options.headers,
    };
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const data: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const message =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: unknown }).error)
          : `HTTP ${res.status}`;
      throw new Error(`${message} (${res.status})`);
    }
    return data;
  }
}
