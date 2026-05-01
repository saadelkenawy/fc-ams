import { buildApp } from './app';
import { config } from './config';
import { pool } from './config/database';

async function start(): Promise<void> {
  const app = await buildApp();

  await app.ready();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Patient service listening on port ${config.PORT}`);
}

async function shutdown(): Promise<void> {
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });

void start();
