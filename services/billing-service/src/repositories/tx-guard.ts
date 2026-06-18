import { PoolClient } from 'pg';

/**
 * Single source of truth for the financial-transaction mutation state machine:
 * which operations are legal in which `payment_status`. Every mutating
 * repository function routes through `assertTransactionMutable` instead of
 * re-implementing its own `SELECT payment_status ... FOR UPDATE` + status
 * checks — the latter had drifted (some sites missed `paid`, some missed
 * `refunded`, the refund-by-appointment paths had no guard at all).
 *
 * This is the application-layer adapter of the freeze policy; the DB triggers
 * (V016 protect_financial_amounts, prevent_settlement_modification) are the
 * authoritative second adapter. Two seams, one rule each.
 */
export type MutationIntent = 'amend-charge' | 'add-extra' | 'change-status' | 'refund';

type Coded = Error & { statusCode: number; code: string };

function coded(message: string, statusCode: number, code: string): Coded {
  return Object.assign(new Error(message), { statusCode, code });
}

const RECONCILED = () => coded('Record is reconciled and locked', 403, 'RECORD_RECONCILED');
const REFUNDED = () => coded('Transaction is refunded and locked', 403, 'RECORD_REFUNDED');
const SETTLED = () => coded('Transaction is settled and locked', 403, 'RECORD_SETTLED');

/**
 * Statuses that block each intent, with the canonical error to raise. All
 * intents freeze the terminal states (`reconciled`, `refunded`); `amend-charge`
 * additionally freezes `paid` because changing the charge would rewrite the
 * settled money group (mirrors the V016 trigger). `refund` carries an extra
 * settlement-reference check (see below) rather than a flat status block.
 */
const BLOCKED: Record<MutationIntent, Partial<Record<string, () => Coded>>> = {
  'amend-charge':  { paid: SETTLED, reconciled: RECONCILED, refunded: REFUNDED },
  'add-extra':     { reconciled: RECONCILED, refunded: REFUNDED },
  'change-status': { reconciled: RECONCILED, refunded: REFUNDED },
  'refund':        { reconciled: RECONCILED, refunded: REFUNDED },
};

export type TransactionSelector = { id: string } | { appointmentId: string };

/**
 * Lock the transaction `FOR UPDATE` and assert the intended mutation is legal
 * for its current `payment_status`. Throws a coded error (404 if missing, 403
 * if the status freezes the intent, 409 if a `refund` would orphan an immutable
 * settlement_record). Returns the locked row (`SELECT *`) so callers can read
 * it without a second query.
 */
export async function assertTransactionMutable(
  client: PoolClient,
  selector: TransactionSelector,
  intent: MutationIntent,
): Promise<Record<string, unknown>> {
  const byId = 'id' in selector;
  const { rows } = await client.query(
    `SELECT * FROM financial_transactions WHERE ${byId ? 'id' : 'appointment_id'} = $1 FOR UPDATE`,
    [byId ? selector.id : selector.appointmentId],
  );
  if (!rows.length) {
    throw coded(
      byId ? 'Transaction not found' : 'No billing record found for this appointment',
      404, 'TRANSACTION_NOT_FOUND',
    );
  }
  const row = rows[0] as Record<string, unknown>;
  const status = row.payment_status as string;

  const blocker = BLOCKED[intent][status];
  if (blocker) throw blocker();

  if (intent === 'refund') {
    // A settled transaction is referenced by an immutable settlement_record
    // (prevent_settlement_modification, P0003). Refunding it would orphan the
    // settlement, so reject up front — the settlement must be voided first.
    const { rows: settled } = await client.query(
      `SELECT 1 FROM settlement_records WHERE $1::uuid = ANY(related_transaction_ids) LIMIT 1`,
      [row.id],
    );
    if (settled.length) {
      throw coded(
        'Transaction is part of a settlement and cannot be refunded; void the settlement first',
        409, 'TRANSACTION_SETTLED',
      );
    }
  }

  return row;
}
