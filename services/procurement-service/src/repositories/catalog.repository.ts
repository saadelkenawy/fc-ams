import { PoolClient } from 'pg';
import { withClient, withTransaction } from '../config/database';

export interface CatalogItem {
  id: string;
  itemName: string;
  itemNameAr?: string;
  category: string;
  clinicalUse?: string;
  clinicTypes: string[];
  budgetTier: string;
  edaStatus: string;
  edaClass?: string;
  localFirst: boolean;
  qtyUnit?: string;
  qtyPerMonth?: number;
  reorderThreshold: number;
  currentStock: number;
  unitCostEgp?: number;
  preferredVendorId?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemInput {
  itemName: string;
  itemNameAr?: string;
  category: string;
  clinicalUse?: string;
  clinicTypes?: string[];
  budgetTier: string;
  edaStatus: string;
  edaClass?: string;
  localFirst?: boolean;
  qtyUnit?: string;
  qtyPerMonth?: number;
  reorderThreshold?: number;
  currentStock?: number;
  unitCostEgp?: number;
  preferredVendorId?: string;
  notes?: string;
}

function rowToItem(row: Record<string, unknown>): CatalogItem {
  return {
    id:                 row.id as string,
    itemName:           row.item_name as string,
    itemNameAr:         row.item_name_ar as string | undefined,
    category:           row.category as string,
    clinicalUse:        row.clinical_use as string | undefined,
    clinicTypes:        (row.clinic_types as string[]) ?? [],
    budgetTier:         row.budget_tier as string,
    edaStatus:          row.eda_status as string,
    edaClass:           row.eda_class as string | undefined,
    localFirst:         row.local_first as boolean,
    qtyUnit:            row.qty_unit as string | undefined,
    qtyPerMonth:        row.qty_per_month as number | undefined,
    reorderThreshold:   row.reorder_threshold as number,
    currentStock:       row.current_stock as number,
    unitCostEgp:        row.unit_cost_egp != null ? parseFloat(row.unit_cost_egp as string) : undefined,
    preferredVendorId:  row.preferred_vendor_id as string | undefined,
    isActive:           row.is_active as boolean,
    notes:              row.notes as string | undefined,
    createdAt:          (row.created_at as Date).toISOString(),
    updatedAt:          (row.updated_at as Date).toISOString(),
  };
}

export async function listItems(params: {
  q?: string;
  category?: string;
  clinicType?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}): Promise<{ data: CatalogItem[]; total: number }> {
  return withClient(async (client: PoolClient) => {
    const conditions: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if (params.q) {
      conditions.push(`item_name ILIKE $${i++}`);
      args.push(`%${params.q}%`);
    }
    if (params.category) {
      conditions.push(`category = $${i++}`);
      args.push(params.category);
    }
    if (params.clinicType) {
      conditions.push(`$${i++} = ANY(clinic_types)`);
      args.push(params.clinicType);
    }
    if (params.isActive !== undefined) {
      conditions.push(`is_active = $${i++}`);
      args.push(params.isActive);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: [cnt] } = await client.query(`SELECT COUNT(*) AS n FROM procurement_items ${where}`, args);
    const total = parseInt(cnt.n as string, 10);

    const offset = (params.page - 1) * params.limit;
    args.push(params.limit, offset);
    const { rows } = await client.query(
      `SELECT * FROM procurement_items ${where} ORDER BY item_name ASC LIMIT $${i++} OFFSET $${i++}`,
      args,
    );
    return { data: rows.map(rowToItem), total };
  });
}

export async function findItemById(id: string): Promise<CatalogItem | null> {
  return withClient(async (client: PoolClient) => {
    const { rows } = await client.query('SELECT * FROM procurement_items WHERE id = $1', [id]);
    return rows.length ? rowToItem(rows[0] as Record<string, unknown>) : null;
  });
}

export async function createItem(input: CatalogItemInput, staffId: string): Promise<CatalogItem> {
  void staffId;
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `INSERT INTO procurement_items
         (item_name, item_name_ar, category, clinical_use, clinic_types, budget_tier, eda_status, eda_class,
          local_first, qty_unit, qty_per_month, reorder_threshold, current_stock, unit_cost_egp, preferred_vendor_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        input.itemName, input.itemNameAr ?? null, input.category, input.clinicalUse ?? null,
        input.clinicTypes ?? [], input.budgetTier, input.edaStatus, input.edaClass ?? null,
        input.localFirst ?? false, input.qtyUnit ?? null, input.qtyPerMonth ?? null,
        input.reorderThreshold ?? 0, input.currentStock ?? 0,
        input.unitCostEgp ?? null, input.preferredVendorId ?? null, input.notes ?? null,
      ],
    );
    return rowToItem(rows[0] as Record<string, unknown>);
  });
}

export async function updateItem(id: string, input: Partial<CatalogItemInput> & { isActive?: boolean; currentStock?: number }): Promise<CatalogItem> {
  return withTransaction(async (client: PoolClient) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    const map: Record<string, string> = {
      itemName: 'item_name', itemNameAr: 'item_name_ar', category: 'category',
      clinicalUse: 'clinical_use', clinicTypes: 'clinic_types', budgetTier: 'budget_tier',
      edaStatus: 'eda_status', edaClass: 'eda_class', localFirst: 'local_first',
      qtyUnit: 'qty_unit', qtyPerMonth: 'qty_per_month', reorderThreshold: 'reorder_threshold',
      currentStock: 'current_stock', unitCostEgp: 'unit_cost_egp',
      preferredVendorId: 'preferred_vendor_id', notes: 'notes', isActive: 'is_active',
    };

    for (const [key, col] of Object.entries(map)) {
      if (key in input) {
        sets.push(`${col} = $${i++}`);
        args.push((input as Record<string, unknown>)[key] ?? null);
      }
    }

    args.push(id);
    const { rows } = await client.query(
      `UPDATE procurement_items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      args,
    );
    if (!rows.length) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
    return rowToItem(rows[0] as Record<string, unknown>);
  });
}
