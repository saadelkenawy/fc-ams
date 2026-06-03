import crypto from 'crypto';
import { pool, withTransaction } from '../config/database';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  nameEn: string;
  nameAr: string | undefined;
  role: string;
  branchId: number;
  doctorId: string | undefined;
  subscriptionTier: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  version: number;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  nameEn: string;
  nameAr?: string;
  role: string;
  branchId: number;
  doctorId?: string;
}

function rowToUser(row: Record<string, unknown>): UserRow {
  return {
    id:               row.id as string,
    email:            row.email as string,
    passwordHash:     row.password_hash as string,
    nameEn:           row.name_en as string,
    nameAr:           row.name_ar as string | undefined,
    role:             row.role as string,
    branchId:         row.branch_id as number,
    doctorId:         row.doctor_id as string | undefined,
    subscriptionTier: (row.subscription_tier as string) ?? 'premium',
    isActive:         row.is_active as boolean,
    lastLoginAt:      row.last_login_at as Date | null,
    failedLogins:     row.failed_logins as number,
    lockedUntil:      row.locked_until as Date | null,
    version:          row.version as number,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase().trim()],
  );
  return rows.length ? rowToUser(rows[0] as Record<string, unknown>) : null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE id = $1 AND is_active = true`,
    [id],
  );
  return rows.length ? rowToUser(rows[0] as Record<string, unknown>) : null;
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name_en, name_ar, role, branch_id, doctor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.email.toLowerCase().trim(),
      input.passwordHash,
      input.nameEn,
      input.nameAr ?? null,
      input.role,
      input.branchId,
      input.doctorId ?? null,
    ],
  );
  return rowToUser(rows[0] as Record<string, unknown>);
}

export async function listUsers(branchId: number): Promise<UserRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE branch_id = $1 ORDER BY created_at DESC`,
    [branchId],
  );
  return rows.map((r) => rowToUser(r as Record<string, unknown>));
}

export async function recordLoginSuccess(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET last_login_at = NOW(), failed_logins = 0, locked_until = NULL, updated_at = NOW()
     WHERE id = $1`,
    [userId],
  );
}

export async function recordLoginFailure(email: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET failed_logins = failed_logins + 1,
         locked_until  = CASE WHEN failed_logins + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
         updated_at    = NOW()
     WHERE email = $1`,
    [email.toLowerCase().trim()],
  );
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, userId],
  );
}

export async function updateUser(
  userId: string,
  patch: { role?: string; isActive?: boolean; nameEn?: string; nameAr?: string; doctorId?: string | null },
): Promise<UserRow> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (patch.role      !== undefined) { sets.push(`role = $${idx++}`);       vals.push(patch.role); }
  if (patch.isActive  !== undefined) { sets.push(`is_active = $${idx++}`);  vals.push(patch.isActive); }
  if (patch.nameEn    !== undefined) { sets.push(`name_en = $${idx++}`);    vals.push(patch.nameEn); }
  if (patch.nameAr    !== undefined) { sets.push(`name_ar = $${idx++}`);    vals.push(patch.nameAr); }
  if ('doctorId' in patch)           { sets.push(`doctor_id = $${idx++}`);  vals.push(patch.doctorId ?? null); }
  if (!sets.length) throw new Error('No fields to update');
  sets.push(`updated_at = NOW()`);
  vals.push(userId);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals,
  );
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  return rowToUser(rows[0] as Record<string, unknown>);
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(
  userId: string,
  rawToken: string,
  expiresAt: Date,
  meta: { ipAddress?: string; userAgent?: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(rawToken), expiresAt, meta.ipAddress ?? null, meta.userAgent ?? null],
  );
}

export async function findRefreshToken(rawToken: string): Promise<{ userId: string; expiresAt: Date } | null> {
  const { rows } = await pool.query(
    `SELECT user_id, expires_at FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [hashToken(rawToken)],
  );
  if (!rows.length) return null;
  const row = rows[0] as Record<string, unknown>;
  return { userId: row.user_id as string, expiresAt: row.expires_at as Date };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [hashToken(rawToken)],
  );
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

export async function findUserByDoctorId(doctorId: string): Promise<UserRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE doctor_id = $1 AND role = 'doctor' LIMIT 1`,
    [doctorId],
  );
  return rows.length ? rowToUser(rows[0] as Record<string, unknown>) : null;
}

export async function deleteUser(userId: string): Promise<void> {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function auditLog(entry: {
  userId?: string;
  email: string;
  event: string;
  ipAddress?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auth_audit_log (user_id, email, event, ip_address, user_agent, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.userId ?? null,
      entry.email,
      entry.event,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
    ],
  );
}
