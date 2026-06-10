import { buildApp } from './app';
import { config } from './config';
import { pool } from './config/database';
import { startOutboxWorker, stopOutboxWorker } from './lib/outbox-worker';

async function start(): Promise<void> {
  const app = await buildApp();

  await app.ready();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Appointment service listening on port ${config.PORT}`);

  startOutboxWorker();
}

async function shutdown(): Promise<void> {
  stopOutboxWorker();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });

void start();
