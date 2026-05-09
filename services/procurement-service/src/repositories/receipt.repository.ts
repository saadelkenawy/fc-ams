import { PoolClient } from 'pg';
import { withClient, withTransaction } from '../config/database';
import { createAlert } from './alert.repository';

export interface ReceiptItem {
  id: string;
  receiptId: string;
  itemId: string;
  batchLotNumber?: string;
  expiryDate?: string;
  quantityReceived: number;
  quantityOrdered?: number;
  unitPriceEgp: number;
  discrepancyFlagged: boolean;
  discrepancyPct?: number;
  discrepancyNotes?: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  vendorId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceTotalEgp?: number;
  invoiceFileUri?: string;
  ocrConfidence?: number;
  ocrOverridden: boolean;
  currencySource: 'EGP' | 'converted';
  cbeRate?: number;
  currencyAuditLog?: Record<string, unknown>;
  dateReceived: string;
  receivedByStaffId: string;
  status: 'pending' | 'approved' | 'discrepancy' | 'cancelled';
  notes?: string;
  items?: ReceiptItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateReceiptInput {
  vendorId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceTotalEgp?: number;
  invoiceFileUri?: string;
  currencySource?: 'EGP' | 'converted';
  cbeRate?: number;
  dateReceived?: string;
  notes?: string;
}

export interface CreateReceiptItemInput {
  itemId: string;
  batchLotNumber?: string;
  expiryDate?: string;
  quantityReceived: number;
  quantityOrdered?: number;
  unitPriceEgp: number;
}

function rowToReceipt(row: Record<string, unknown>): Receipt {
  return {
    id:                  row.id as string,
    receiptNumber:       row.receipt_number as string,
    vendorId:            row.vendor_id as string,
    invoiceNumber:       row.invoice_number as string | undefined,
    invoiceDate:         row.invoice_date ? (row.invoice_date as Date).toISOString().split('T')[0] : undefined,
    invoiceTotalEgp:     row.invoice_total_egp != null ? parseFloat(row.invoice_total_egp as string) : undefined,
    invoiceFileUri:      row.invoice_file_uri as string | undefined,
    ocrConfidence:       row.ocr_confidence != null ? parseFloat(row.ocr_confidence as string) : undefined,
    ocrOverridden:       row.ocr_overridden as boolean,
    currencySource:      row.currency_source as Receipt['currencySource'],
    cbeRate:             row.cbe_rate != null ? parseFloat(row.cbe_rate as string) : undefined,
    currencyAuditLog:    row.currency_audit_log as Record<string, unknown> | undefined,
    dateReceived:        (row.date_received as Date).toISOString().split('T')[0],
    receivedByStaffId:   row.received_by_staff_id as string,
    status:              row.status as Receipt['status'],
    notes:               row.notes as string | undefined,
    createdAt:           (row.created_at as Date).toISOString(),
    updatedAt:           (row.updated_at as Date).toISOString(),
  };
}

function rowToItem(row: Record<string, unknown>): ReceiptItem {
  return {
    id:                  row.id as string,
    receiptId:           row.receipt_id as string,
    itemId:              row.item_id as string,
    batchLotNumber:      row.batch_lot_number as string | undefined,
    expiryDate:          row.expiry_date ? (row.expiry_date as Date).toISOString().split('T')[0] : undefined,
    quantityReceived:    row.quantity_received as number,
    quantityOrdered:     row.quantity_ordered as number | undefined,
    unitPriceEgp:        parseFloat(row.unit_price_egp as string),
    discrepancyFlagged:  row.discrepancy_flagged as boolean,
    discrepancyPct:      row.discrepancy_pct != null ? parseFloat(row.discrepancy_pct as string) : undefined,
    discrepancyNotes:    row.discrepancy_notes as string | undefined,
    createdAt:           (row.created_at as Date).toISOString(),
  };
}

export async function listReceipts(params: {
  vendorId?: string;
  status?: string;
  page: number;
  limit: number;
}): Promise<{ data: Receipt[]; total: number }> {
  return withClient(async (client: PoolClient) => {
    const conditions: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if (params.vendorId) { conditions.push(`vendor_id = $${i++}`); args.push(params.vendorId); }
    if (params.status)   { conditions.push(`status = $${i++}`);    args.push(params.status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: [cnt] } = await client.query(`SELECT COUNT(*) AS n FROM procurement_receipts ${where}`, args);
    const total = parseInt(cnt.n as string, 10);

    const offset = (params.page - 1) * params.limit;
    args.push(params.limit, offset);
    const { rows } = await client.query(
      `SELECT * FROM procurement_receipts ${where} ORDER BY date_received DESC, created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      args,
    );
    return { data: rows.map(rowToReceipt), total };
  });
}

export async function findReceiptById(id: string): Promise<Receipt | null> {
  return withClient(async (client: PoolClient) => {
    const { rows } = await client.query('SELECT * FROM procurement_receipts WHERE id = $1', [id]);
    if (!rows.length) return null;
    const receipt = rowToReceipt(rows[0] as Record<string, unknown>);
    const { rows: itemRows } = await client.query(
      'SELECT * FROM procurement_receipt_items WHERE receipt_id = $1 ORDER BY created_at',
      [id],
    );
    receipt.items = itemRows.map(rowToItem);
    return receipt;
  });
}

export async function createReceipt(input: CreateReceiptInput, staffId: string): Promise<Receipt> {
  return withTransaction(async (client: PoolClient) => {
    const cbeAudit = input.cbeRate
      ? { rate: input.cbeRate, timestamp: new Date().toISOString(), source: 'manual' }
      : null;

    const { rows } = await client.query(
      `INSERT INTO procurement_receipts
         (vendor_id, invoice_number, invoice_date, invoice_total_egp,
          invoice_file_uri, currency_source, cbe_rate, currency_audit_log,
          date_received, received_by_staff_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        input.vendorId,
        input.invoiceNumber ?? null,
        input.invoiceDate ?? null,
        input.invoiceTotalEgp ?? null,
        input.invoiceFileUri ?? null,
        input.currencySource ?? 'EGP',
        input.cbeRate ?? null,
        cbeAudit ? JSON.stringify(cbeAudit) : null,
        input.dateReceived ?? new Date().toISOString().split('T')[0],
        staffId,
        input.notes ?? null,
      ],
    );
    return rowToReceipt(rows[0] as Record<string, unknown>);
  });
}

export async function addReceiptItem(receiptId: string, input: CreateReceiptItemInput): Promise<ReceiptItem> {
  return withTransaction(async (client: PoolClient) => {
    let discrepancyPct: number | null = null;
    let discrepancyFlagged = false;

    if (input.quantityOrdered !== undefined && input.quantityOrdered > 0) {
      discrepancyPct = Math.abs(input.quantityReceived - input.quantityOrdered) / input.quantityOrdered * 100;
      discrepancyFlagged = discrepancyPct > 0;
    }

    const { rows } = await client.query(
      `INSERT INTO procurement_receipt_items
         (receipt_id, item_id, batch_lot_number, expiry_date, quantity_received, quantity_ordered,
          unit_price_egp, discrepancy_flagged, discrepancy_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        receiptId, input.itemId,
        input.batchLotNumber ?? null,
        input.expiryDate ?? null,
        input.quantityReceived,
        input.quantityOrdered ?? null,
        input.unitPriceEgp,
        discrepancyFlagged,
        discrepancyPct,
      ],
    );
    const item = rowToItem(rows[0] as Record<string, unknown>);

    if (discrepancyFlagged && discrepancyPct !== null) {
      const { rows: [piRow] } = await client.query(
        'SELECT item_name FROM procurement_items WHERE id = $1', [input.itemId],
      );
      await createAlert({
        alertType: 'DISCREPANCY_ALERT',
        itemId: input.itemId,
        receiptId,
        receiptItemId: item.id,
        message: `Quantity discrepancy for "${(piRow as Record<string, unknown>).item_name}": ordered ${input.quantityOrdered}, received ${input.quantityReceived} (${discrepancyPct.toFixed(1)}% variance).`,
        severity: discrepancyPct >= 10 ? 'critical' : 'warning',
      });
      await client.query(`UPDATE procurement_receipts SET status = 'discrepancy' WHERE id = $1`, [receiptId]);
    }

    // Update stock
    await client.query(
      `UPDATE procurement_items SET current_stock = current_stock + $1 WHERE id = $2`,
      [input.quantityReceived, input.itemId],
    );

    return item;
  });
}

export async function updateReceiptStatus(id: string, status: Receipt['status']): Promise<Receipt> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE procurement_receipts SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (!rows.length) throw Object.assign(new Error('Receipt not found'), { statusCode: 404 });
    return rowToReceipt(rows[0] as Record<string, unknown>);
  });
}

export async function getOverviewStats(): Promise<{
  totalItems: number;
  totalVendors: number;
  totalReceipts: number;
  pendingReceipts: number;
  discrepancyReceipts: number;
  unreadAlerts: number;
  lowStockItems: number;
}> {
  return withClient(async (client: PoolClient) => {
    const [items, vendors, receipts, alerts, lowStock] = await Promise.all([
      client.query('SELECT COUNT(*) AS n FROM procurement_items WHERE is_active = true'),
      client.query('SELECT COUNT(*) AS n FROM procurement_vendors WHERE is_approved = true'),
      client.query(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'discrepancy' THEN 1 ELSE 0 END) AS discrepancy
        FROM procurement_receipts`),
      client.query('SELECT COUNT(*) AS n FROM procurement_alerts WHERE is_read = false'),
      client.query('SELECT COUNT(*) AS n FROM procurement_items WHERE is_active = true AND reorder_threshold > 0 AND current_stock <= reorder_threshold'),
    ]);
    return {
      totalItems:          parseInt((items.rows[0] as Record<string, string>).n, 10),
      totalVendors:        parseInt((vendors.rows[0] as Record<string, string>).n, 10),
      totalReceipts:       parseInt((receipts.rows[0] as Record<string, string>).total, 10),
      pendingReceipts:     parseInt((receipts.rows[0] as Record<string, string>).pending ?? '0', 10),
      discrepancyReceipts: parseInt((receipts.rows[0] as Record<string, string>).discrepancy ?? '0', 10),
      unreadAlerts:        parseInt((alerts.rows[0] as Record<string, string>).n, 10),
      lowStockItems:       parseInt((lowStock.rows[0] as Record<string, string>).n, 10),
    };
  });
}
