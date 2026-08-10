import type { NextFunction, Request, Response } from 'express';

export interface ApiKeyAuthOptions {
  keys: Map<string, string>;
}

export function parseApiKeys(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0 && eq < trimmed.length - 1) {
      const name = trimmed.slice(0, eq).trim();
      const key = trimmed.slice(eq + 1).trim();
      if (name && key) map.set(key, name);
    } else if (trimmed) {
      map.set(trimmed, 'public');
    }
  }
  return map;
}

export function createApiKeyAuth(keys: Map<string, string>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const relative = req.path;
    if (relative === '/health' || relative.startsWith('/docs')) {
      next();
      return;
    }

    let apiKey: string | undefined;
    const auth = req.get('authorization');
    if (auth && /^Bearer\s+/i.test(auth)) {
      apiKey = auth.replace(/^Bearer\s+/i, '').trim();
    }
    if (!apiKey) {
      apiKey = req.get('x-api-key')?.trim();
    }

    if (!apiKey) {
      res.status(401).json({ error: 'unauthorized: missing API key' });
      return;
    }

    const tenant = keys.get(apiKey);
    if (!tenant) {
      res.status(401).json({ error: 'unauthorized: invalid API key' });
      return;
    }

    res.locals.tenant = tenant;
    next();
  };
}
