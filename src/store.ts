import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Session } from './types.js';

export interface Store {
  all(): Promise<Session[]>;
  get(id: string): Promise<Session | undefined>;
  put(session: Session): Promise<void>;
  /** Await all pending writes; returns once the on-disk state is current. */
  flush(): Promise<void>;
}

const DEFAULT_FLUSH_INTERVAL_MS = 50;

/**
 * A file-backed store tuned for low write latency and stability.
 *
 * Sessions are sharded into `dataDir/sessions/<id>.json`, one file per session,
 * so persisting a change only rewrites that one small file — never the whole
 * dataset. Writes are coalesced: `put` updates the in-memory map immediately
 * (reads never touch disk) and schedules a single debounced pass over the dirty
 * sessions. Only one persist runs at a time. Terminal state changes and graceful
 * shutdown call `flush()` explicitly, so the important transitions are durable
 * while per-heartbeat latency stays off the disk path.
 */
export class JsonFileStore implements Store {
  private readonly dir: string;
  private readonly sessionsDir: string;
  private readonly legacyFile: string;
  private readonly flushIntervalMs: number;
  private readonly sessions = new Map<string, Session>();
  private readonly dirty = new Set<string>();
  private loaded = false;
  private legacyPending = false;
  private persistRunning = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(
    dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data'),
    flushIntervalMs = Number(
      process.env.FLUSH_INTERVAL_MS ?? DEFAULT_FLUSH_INTERVAL_MS,
    ),
  ) {
    this.dir = path.resolve(dataDir);
    this.sessionsDir = path.join(this.dir, 'sessions');
    this.legacyFile = path.join(this.dir, 'sessions.json');
    this.flushIntervalMs =
      Number.isFinite(flushIntervalMs) && flushIntervalMs >= 0
        ? flushIntervalMs
        : DEFAULT_FLUSH_INTERVAL_MS;
  }

  async all(): Promise<Session[]> {
    await this.ensureLoaded();
    return [...this.sessions.values()];
  }

  async get(id: string): Promise<Session | undefined> {
    await this.ensureLoaded();
    return this.sessions.get(id);
  }

  put(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    this.dirty.add(session.id);
    this.schedule();
    return Promise.resolve();
  }

  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.loaded) await this.ensureLoaded();
    for (;;) {
      if (this.dirty.size === 0 && !this.persistRunning) return;
      if (!this.persistRunning) {
        void this.run();
      }
      await this.persistChain;
    }
  }

  private schedule(): void {
    if (this.persistRunning || this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.run();
    }, this.flushIntervalMs);
  }

  private async run(): Promise<void> {
    if (this.persistRunning) return;
    this.persistRunning = true;
    try {
      for (;;) {
        if (this.dirty.size === 0) break;
        const ids = [...this.dirty];
        this.dirty.clear();
        this.persistChain = this.persistChain.then(() => this.persist(ids));
        await this.persistChain;
      }
      if (this.legacyPending) {
        this.legacyPending = false;
        this.persistChain = this.persistChain.then(() =>
          rename(this.legacyFile, `${this.legacyFile}.migrated`),
        );
        await this.persistChain;
      }
    } finally {
      this.persistRunning = false;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(this.sessionsDir, { recursive: true });
    let names: string[] = [];
    try {
      names = await readdir(this.sessionsDir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(this.sessionsDir, name), 'utf8');
        const session: unknown = JSON.parse(raw);
        if (isSession(session)) {
          this.sessions.set(session.id, session);
        }
      } catch {
        // skip unreadable session files
      }
    }
    if (names.length === 0) {
      try {
        const raw = await readFile(this.legacyFile, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (isSession(item)) {
              this.sessions.set(item.id, item);
              this.dirty.add(item.id);
            }
          }
          if (this.dirty.size > 0) this.legacyPending = true;
        }
      } catch (err) {
        if (!isNodeError(err) || err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
    this.loaded = true;
  }

  private async persist(ids: string[]): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    for (const id of ids) {
      const session = this.sessions.get(id);
      if (!session) continue;
      const file = path.join(this.sessionsDir, `${id}.json`);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(session), 'utf8');
      await rename(tmp, file);
    }
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.status === 'string';
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
