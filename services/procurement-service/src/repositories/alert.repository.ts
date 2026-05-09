import { PoolClient } from 'pg';
import { withClient, withTransaction } from '../config/database';

export interface ProcurementAlert {
  id: string;
  alertType: 'EXPIRY_ALERT' | 'REORDER_ALERT' | 'DISCREPANCY_ALERT';
  itemId?: string;
  receiptId?: string;
  receiptItemId?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  triggeredAt: string;
  resolvedAt?: string;
}

function rowToAlert(row: Record<string, unknown>): ProcurementAlert {
  return {
    id:             row.id as string,
    alertType:      row.alert_type as ProcurementAlert['alertType'],
    itemId:         row.item_id as string | undefined,
    receiptId:      row.receipt_id as string | undefined,
    receiptItemId:  row.receipt_item_id as string | undefined,
    message:        row.message as string,
    severity:       row.severity as ProcurementAlert['severity'],
    isRead:         row.is_read as boolean,
    triggeredAt:    (row.triggered_at as Date).toISOString(),
    resolvedAt:     row.resolved_at ? (row.resolved_at as Date).toISOString() : undefined,
  };
}

export async function createAlert(input: {
  alertType: ProcurementAlert['alertType'];
  itemId?: string;
  receiptId?: string;
  receiptItemId?: string;
  message: string;
  severity?: ProcurementAlert['severity'];
}): Promise<ProcurementAlert> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `INSERT INTO procurement_alerts (alert_type, item_id, receipt_id, receipt_item_id, message, severity)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [input.alertType, input.itemId ?? null, input.receiptId ?? null,
       input.receiptItemId ?? null, input.message, input.severity ?? 'warning'],
    );
    return rowToAlert(rows[0] as Record<string, unknown>);
  });
}

export async function listAlerts(params: {
  alertType?: string;
  isRead?: boolean;
  page: number;
  limit: number;
}): Promise<{ data: ProcurementAlert[]; total: number; unreadCount: number }> {
  return withClient(async (client: PoolClient) => {
    const conditions: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if (params.alertType) { conditions.push(`alert_type = $${i++}`); args.push(params.alertType); }
    if (params.isRead !== undefined) { conditions.push(`is_read = $${i++}`); args.push(params.isRead); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: [cnt] } = await client.query(`SELECT COUNT(*) AS n FROM procurement_alerts ${where}`, args);
    const total = parseInt(cnt.n as string, 10);

    const { rows: [uc] } = await client.query(`SELECT COUNT(*) AS n FROM procurement_alerts WHERE is_read = false`);
    const unreadCount = parseInt(uc.n as string, 10);

    const offset = (params.page - 1) * params.limit;
    args.push(params.limit, offset);
    const { rows } = await client.query(
      `SELECT * FROM procurement_alerts ${where} ORDER BY triggered_at DESC LIMIT $${i++} OFFSET $${i++}`,
      args,
    );
    return { data: rows.map(rowToAlert), total, unreadCount };
  });
}

export async function markRead(id: string): Promise<void> {
  return withTransaction(async (client: PoolClient) => {
    await client.query(
      `UPDATE procurement_alerts SET is_read = true, resolved_at = now() WHERE id = $1`,
      [id],
    );
  });
}

export async function markAllRead(): Promise<number> {
  return withTransaction(async (client: PoolClient) => {
    const { rowCount } = await client.query(
      `UPDATE procurement_alerts SET is_read = true, resolved_at = now() WHERE is_read = false`,
    );
    return rowCount ?? 0;
  });
}

export async function checkExpiryAlerts(): Promise<number> {
  return withTransaction(async (client: PoolClient) => {
    // T-90 days: warning
    await client.query(`
      INSERT INTO procurement_alerts (alert_type, item_id, receipt_item_id, message, severity)
      SELECT 'EXPIRY_ALERT', ri.item_id, ri.id,
             'Item "' || pi.item_name || '" (lot: ' || COALESCE(ri.batch_lot_number,'—') || ') expires on ' || ri.expiry_date || ' — 90 days notice.',
             'warning'
      FROM procurement_receipt_items ri
      JOIN procurement_items pi ON pi.id = ri.item_id
      WHERE ri.expiry_date BETWEEN CURRENT_DATE + 85 AND CURRENT_DATE + 95
        AND NOT EXISTS (
          SELECT 1 FROM procurement_alerts a
          WHERE a.receipt_item_id = ri.id AND a.alert_type = 'EXPIRY_ALERT'
            AND a.severity = 'warning' AND a.triggered_at > CURRENT_DATE - 3
        )
    `);
    // T-30 days: critical
    const { rowCount } = await client.query(`
      INSERT INTO procurement_alerts (alert_type, item_id, receipt_item_id, message, severity)
      SELECT 'EXPIRY_ALERT', ri.item_id, ri.id,
             'CRITICAL: Item "' || pi.item_name || '" (lot: ' || COALESCE(ri.batch_lot_number,'—') || ') expires on ' || ri.expiry_date || ' — 30 days notice.',
             'critical'
      FROM procurement_receipt_items ri
      JOIN procurement_items pi ON pi.id = ri.item_id
      WHERE ri.expiry_date BETWEEN CURRENT_DATE + 28 AND CURRENT_DATE + 32
        AND NOT EXISTS (
          SELECT 1 FROM procurement_alerts a
          WHERE a.receipt_item_id = ri.id AND a.alert_type = 'EXPIRY_ALERT'
            AND a.severity = 'critical' AND a.triggered_at > CURRENT_DATE - 3
        )
    `);
    return rowCount ?? 0;
  });
}

export async function checkReorderAlerts(): Promise<number> {
  return withTransaction(async (client: PoolClient) => {
    const { rowCount } = await client.query(`
      INSERT INTO procurement_alerts (alert_type, item_id, message, severity)
      SELECT 'REORDER_ALERT', id,
             'Stock for "' || item_name || '" is at ' || current_stock || ' ' || COALESCE(qty_unit,'units') || ' — at or below reorder threshold of ' || reorder_threshold || '.',
             'warning'
      FROM procurement_items
      WHERE is_active = true AND reorder_threshold > 0 AND current_stock <= reorder_threshold
        AND NOT EXISTS (
          SELECT 1 FROM procurement_alerts a
          WHERE a.item_id = procurement_items.id AND a.alert_type = 'REORDER_ALERT'
            AND a.is_read = false
        )
    `);
    return rowCount ?? 0;
  });
}
