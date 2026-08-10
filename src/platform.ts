import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApiKeyAuth, parseApiKeys } from './auth.js';
import { ContinueClient } from './client.js';
import { createDownloadBox, type DownloadBoxHandle } from './downloadbox.js';
import { OPENAPI } from './openapi.js';
import { PolyarbController } from './polyarb/controller.js';
import { createRouter } from './routes.js';
import { SessionService } from './service.js';
import { JsonFileStore } from './store.js';
import { PLATFORM_UI } from './ui.js';

export interface PlatformOptions {
  port?: number;
  dataDir?: string;
  downloadDir?: string;
  baseUrl?: string;
  apiKeys?: Map<string, string>;
}

export interface PlatformHandle {
  app: express.Express;
  service: SessionService;
  store: JsonFileStore;
  controller: PolyarbController;
  box: DownloadBoxHandle;
  port: number;
}

/**
 * The unified Chit platform: Continue Protocol session API, the Download Box,
 * and the Polyarb scan controller all on one port, behind one UI.
 */
export function createPlatform(options: PlatformOptions = {}): PlatformHandle {
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const dataDir = path.resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  const downloadDir = path.resolve(
    options.downloadDir ?? process.env.DOWNLOAD_DIR ?? './downloads',
  );
  const keys = options.apiKeys ?? parseApiKeys(process.env.API_KEYS);

  const store = new JsonFileStore(dataDir);
  const service = new SessionService(store);

  const baseUrl = options.baseUrl ?? `http://127.0.0.1:${port}`;
  const firstKey = keys.size > 0 ? [...keys.keys()][0] : undefined;
  const client = new ContinueClient({ baseUrl, apiKey: firstKey });

  const box = createDownloadBox({ client, downloadDir });
  const controller = new PolyarbController(client);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  if (keys.size > 0) {
    app.use('/api', createApiKeyAuth(keys));
    app.use('/polyarb', createApiKeyAuth(keys));
  }

  app.use('/api', createRouter(service));

  app.get('/api/docs', (_req: Request, res: Response) => {
    res.json(OPENAPI);
  });

  app.get('/api/docs/html', (_req: Request, res: Response) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Chit — API docs</title>
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

  app.use('/polyarb', controller.router());

  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(PLATFORM_UI);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }
    if (err instanceof Error && 'status' in err) {
      const status = (err as { status: number }).status;
      if (Number.isInteger(status)) {
        res.status(status).json({ error: err.message });
        return;
      }
    }
    const message = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: message });
  });

  app.use(box.app);

  return { app, service, store, controller, box, port };
}

export function startPlatform(): { server: http.Server; handle: PlatformHandle } {
  const port = Number(process.env.PORT ?? 3001);
  const handle = createPlatform({ port });
  const server = http.createServer(handle.app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`chit platform listening on http://0.0.0.0:${port}`);
    console.log(`  data: ${path.resolve(process.env.DATA_DIR ?? './data')}`);
    console.log(`  downloads: ${path.resolve(process.env.DOWNLOAD_DIR ?? './downloads')}`);
  });
  handle.box.start();

  const shutdown = (): void => {
    handle.box.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, handle };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    startPlatform();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
