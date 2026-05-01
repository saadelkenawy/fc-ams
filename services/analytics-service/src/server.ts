import { buildApp } from './app';
import { config } from './config';

async function start(): Promise<void> {
  const app = await buildApp();

  await app.ready();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Analytics service listening on port ${config.PORT}`);
}

async function shutdown(): Promise<void> {
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });

void start();
