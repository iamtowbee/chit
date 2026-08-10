import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Session } from './types.js';

export interface Store {
  all(): Promise<Session[]>;
  get(id: string): Promise<Session | undefined>;
  put(session: Session): Promise<void>;
}

export class JsonFileStore implements Store {
  private readonly filePath: string;
  private readonly sessions = new Map<string, Session>();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data'),
  ) {
    this.filePath = path.join(dataDir, 'sessions.json');
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
    this.writeChain = this.writeChain.then(() => this.persist());
    return this.writeChain;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isSession(item)) {
            this.sessions.set(item.id, item);
          }
        }
      }
    } catch (err) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify([...this.sessions.values()], null, 2), 'utf8');
    await rename(tmp, this.filePath);
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
