import { buildApp } from './app';
import { config } from './config';

async function start(): Promise<void> {
  const app = await buildApp();
  await app.ready();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Procurement service listening on port ${config.PORT}`);
}

process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT',  () => { process.exit(0); });

void start();
