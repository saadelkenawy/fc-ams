import { metricsRegistry, promClient } from '@fadl/service-kit';
import { backlogCounts, processDueBatch, OutboxRow } from '../repositories/outbox.repository';
import { createBillingTransaction, CreateBillingTransactionInput } from '../clients/billing';
import { config } from '../config';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 20;

const outboxGauge = new promClient.Gauge({
  name: 'appointment_outbox_rows',
  help: 'appointment_outbox rows by status (alert when pending grows or dead > 0)',
  labelNames: ['status'],
  registers: [metricsRegistry(config.SERVICE_NAME)],
});

let timer: NodeJS.Timeout | null = null;
let running = false;

async function deliver(row: OutboxRow): Promise<void> {
  switch (row.kind) {
    case 'billing.create':
      await createBillingTransaction(row.payload as unknown as CreateBillingTransactionInput);
      return;
    default:
      throw new Error(`Unknown outbox kind: ${row.kind as string}`);
  }
}

async function tick(): Promise<void> {
  if (running) return; // skip overlapping ticks
  running = true;
  try {
    await processDueBatch(BATCH_SIZE, deliver);
    const { pending, dead } = await backlogCounts();
    outboxGauge.set({ status: 'pending' }, pending);
    outboxGauge.set({ status: 'dead' }, dead);
  } catch (err) {
    console.error('[outbox] poll failed:', (err as Error).message);
  } finally {
    running = false;
  }
}

export function startOutboxWorker(): void {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  timer.unref();
  console.log(`[outbox] worker started (every ${POLL_INTERVAL_MS / 1000}s, batch ${BATCH_SIZE})`);
}

export function stopOutboxWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
