export type SessionStatus =
  | 'pending'
  | 'queued'
  | 'active'
  | 'paused'
  | 'resuming'
  | 'stalled'
  | 'retrying'
  | 'verifying'
  | 'done'
  | 'cancelled'
  | 'failed';

export interface Checkpoint {
  id: string;
  at: string;
  step: number;
  progress: number;
  data: unknown;
}

export interface Session {
  id: string;
  status: SessionStatus;
  tenant: string;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt: string | null;
  currentStep: number;
  totalSteps: number | null;
  progress: number;
  data: unknown;
  checkpoints: Checkpoint[];
  error: string | null;
  metadata: Record<string, unknown>;
  webhookUrl: string | null;
  attempts: number;
  maxAttempts: number | null;
  version: number;
}

export interface CreateSessionInput {
  totalSteps?: number;
  metadata?: Record<string, unknown>;
  data?: unknown;
  webhookUrl?: string;
  maxAttempts?: number;
}

export interface HeartbeatInput {
  step?: number;
  progress?: number;
  data?: unknown;
  note?: string;
}

export interface ResumeInput {
  checkpointId?: string;
  step?: number;
}

export interface ListPagination {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface ListResult {
  sessions: Session[];
  total: number;
  hasMore: boolean;
}

export const STATUSES: readonly SessionStatus[] = [
  'pending',
  'queued',
  'active',
  'paused',
  'resuming',
  'stalled',
  'retrying',
  'verifying',
  'done',
  'cancelled',
  'failed',
];

/** States a heartbeat/checkpoint can wake up to `active`. */
export const RESUMABLE_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'active',
  'paused',
  'resuming',
  'retrying',
]);

/** States that count as "not finished yet" — cancellation/failure allowed. */
export const NON_TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'pending',
  'queued',
  'active',
  'paused',
  'resuming',
  'stalled',
  'retrying',
  'verifying',
]);

export const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'done',
  'cancelled',
  'failed',
]);

/** States eligible for the watchdog (heartbeat timeout) to mark `stalled`. */
export const WATCHDOG_ELIGIBLE: ReadonlySet<SessionStatus> = new Set([
  'active',
  'paused',
  'resuming',
  'retrying',
]);
