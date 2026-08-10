import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createApiKeyAuth, parseApiKeys } from './auth.js';
import { HttpError } from './errors.js';
import { OPENAPI } from './openapi.js';
import { createRouter } from './routes.js';
import { SessionService } from './service.js';
import { JsonFileStore } from './store.js';

export interface AppOptions {
  dataDir?: string;
  store?: JsonFileStore;
  apiKeys?: Map<string, string>;
}

export function createApp(options: AppOptions = {}): {
  app: Express;
  service: SessionService;
  store: JsonFileStore;
} {
  const store = options.store ?? new JsonFileStore(options.dataDir);
  const service = new SessionService(store);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const keys = options.apiKeys ?? parseApiKeys(process.env.API_KEYS);
  if (keys.size > 0) {
    app.use('/api', createApiKeyAuth(keys));
  }

  app.use('/api', createRouter(service));

  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Continue Protocol API</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
      code { background: #f0f0f0; padding: 0.15rem 0.4rem; border-radius: 4px; }
      a { color: #0366d6; }
    </style>
  </head>
  <body>
    <h1>Continue Protocol API</h1>
    <p>A continue/resume state machine for long-running jobs. This server is API-only; there is no page here.</p>
    <ul>
      <li><a href="/api/docs/html">Interactive API docs (Swagger UI)</a></li>
      <li><a href="/api/docs">OpenAPI spec (JSON)</a></li>
      <li><a href="/api/health">Health check</a></li>
    </ul>
    <h2>Quick start</h2>
    <p>Create a session:</p>
    <pre>curl -X POST /api/sessions -H "Content-Type: application/json" -d '{"totalSteps": 5}'</pre>
  </body>
</html>`);
  });

  app.get('/api/docs', (_req: Request, res: Response) => {
    res.json(OPENAPI);
  });

  app.get('/api/docs/html', (_req: Request, res: Response) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Continue Protocol API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: '/api/docs', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: message });
  });

  return { app, service, store };
}
