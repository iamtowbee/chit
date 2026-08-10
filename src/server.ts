import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

const { app, store } = createApp();

const server = app.listen(port, host, () => {
  console.log(`continue-protocol listening on http://${host}:${port}`);
});

const shutdown = (): void => {
  const exit = (): void => process.exit(0);
  Promise.resolve()
    .then(() => store.flush())
    .catch(() => undefined)
    .finally(() => {
      server.close(() => exit());
      setTimeout(exit, 2000).unref();
    });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
