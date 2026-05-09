import { PoolClient } from 'pg';
import { withClient, withTransaction } from '../config/database';

export interface Vendor {
  id: string;
  vendorName: string;
  vendorNameAr?: string;
  vendorType: string;
  brandsCovered?: string;
  categoriesServed: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorInput {
  vendorName: string;
  vendorNameAr?: string;
  vendorType: string;
  brandsCovered?: string;
  categoriesServed?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

function rowToVendor(row: Record<string, unknown>): Vendor {
  return {
    id:               row.id as string,
    vendorName:       row.vendor_name as string,
    vendorNameAr:     row.vendor_name_ar as string | undefined,
    vendorType:       row.vendor_type as string,
    brandsCovered:    row.brands_covered as string | undefined,
    categoriesServed: (row.categories_served as string[]) ?? [],
    contactName:      row.contact_name as string | undefined,
    contactPhone:     row.contact_phone as string | undefined,
    contactEmail:     row.contact_email as string | undefined,
    notes:            row.notes as string | undefined,
    isApproved:       row.is_approved as boolean,
    createdAt:        (row.created_at as Date).toISOString(),
    updatedAt:        (row.updated_at as Date).toISOString(),
  };
}

export async function listVendors(params: {
  q?: string;
  vendorType?: string;
  category?: string;
  isApproved?: boolean;
  page: number;
  limit: number;
}): Promise<{ data: Vendor[]; total: number }> {
  return withClient(async (client: PoolClient) => {
    const conditions: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    if (params.q) {
      conditions.push(`vendor_name ILIKE $${i++}`);
      args.push(`%${params.q}%`);
    }
    if (params.vendorType) {
      conditions.push(`vendor_type = $${i++}`);
      args.push(params.vendorType);
    }
    if (params.category) {
      conditions.push(`$${i++} = ANY(categories_served)`);
      args.push(params.category);
    }
    if (params.isApproved !== undefined) {
      conditions.push(`is_approved = $${i++}`);
      args.push(params.isApproved);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: [cnt] } = await client.query(`SELECT COUNT(*) AS n FROM procurement_vendors ${where}`, args);
    const total = parseInt(cnt.n as string, 10);

    const offset = (params.page - 1) * params.limit;
    args.push(params.limit, offset);
    const { rows } = await client.query(
      `SELECT * FROM procurement_vendors ${where} ORDER BY vendor_name ASC LIMIT $${i++} OFFSET $${i++}`,
      args,
    );
    return { data: rows.map(rowToVendor), total };
  });
}

export async function findVendorById(id: string): Promise<Vendor | null> {
  return withClient(async (client: PoolClient) => {
    const { rows } = await client.query('SELECT * FROM procurement_vendors WHERE id = $1', [id]);
    return rows.length ? rowToVendor(rows[0] as Record<string, unknown>) : null;
  });
}

export async function createVendor(input: VendorInput): Promise<Vendor> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `INSERT INTO procurement_vendors
         (vendor_name, vendor_name_ar, vendor_type, brands_covered, categories_served,
          contact_name, contact_phone, contact_email, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        input.vendorName, input.vendorNameAr ?? null, input.vendorType,
        input.brandsCovered ?? null, input.categoriesServed ?? [],
        input.contactName ?? null, input.contactPhone ?? null,
        input.contactEmail ?? null, input.notes ?? null,
      ],
    );
    return rowToVendor(rows[0] as Record<string, unknown>);
  });
}

export async function updateVendor(id: string, input: Partial<VendorInput> & { isApproved?: boolean }): Promise<Vendor> {
  return withTransaction(async (client: PoolClient) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;

    const map: Record<string, string> = {
      vendorName: 'vendor_name', vendorNameAr: 'vendor_name_ar', vendorType: 'vendor_type',
      brandsCovered: 'brands_covered', categoriesServed: 'categories_served',
      contactName: 'contact_name', contactPhone: 'contact_phone',
      contactEmail: 'contact_email', notes: 'notes', isApproved: 'is_approved',
    };

    for (const [key, col] of Object.entries(map)) {
      if (key in input) {
        sets.push(`${col} = $${i++}`);
        args.push((input as Record<string, unknown>)[key] ?? null);
      }
    }

    args.push(id);
    const { rows } = await client.query(
      `UPDATE procurement_vendors SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      args,
    );
    if (!rows.length) throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });
    return rowToVendor(rows[0] as Record<string, unknown>);
  });
}
