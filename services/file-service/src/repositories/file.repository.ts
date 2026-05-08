import { withRlsContext, withTransaction } from '../config/database';

export interface FileRecord {
  id: string;
  fileKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  entityType: string;
  entityId?: string;
  description?: string;
  uploadedBy: string;
  branchId: number;
  createdAt: string;
}

function rowToFile(r: Record<string, unknown>): FileRecord {
  return {
    id: r.id as string,
    fileKey: r.file_key as string,
    originalName: r.original_name as string,
    mimeType: r.mime_type as string,
    sizeBytes: r.size_bytes as number,
    entityType: r.entity_type as string,
    entityId: r.entity_id as string | undefined,
    description: r.description as string | undefined,
    uploadedBy: r.uploaded_by as string,
    branchId: r.branch_id as number,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function createFileRecord(input: {
  fileKey: string; originalName: string; mimeType: string; sizeBytes: number;
  entityType: string; entityId?: string; description?: string; uploadedBy: string; branchId: number;
}): Promise<FileRecord> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `INSERT INTO files (file_key, original_name, mime_type, size_bytes, entity_type, entity_id, description, uploaded_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [input.fileKey, input.originalName, input.mimeType, input.sizeBytes,
       input.entityType, input.entityId ?? null, input.description ?? null,
       input.uploadedBy, input.branchId],
    );
    return rowToFile(rows[0]);
  });
}

export async function findFileById(id: string): Promise<FileRecord | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(`SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return rows.length ? rowToFile(rows[0] as Record<string, unknown>) : null;
  });
}

export async function listFilesByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM files WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [entityType, entityId],
    );
    return (rows as Record<string, unknown>[]).map(rowToFile);
  });
}

export async function softDeleteFile(id: string): Promise<void> {
  return withRlsContext(async (client) => {
    await client.query(`UPDATE files SET deleted_at = NOW() WHERE id = $1`, [id]);
  });
}
