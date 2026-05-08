import { pool, withTransaction } from '../config/database';

export interface ChatSession {
  id: string;
  patientId?: string;
  language: 'ar' | 'en';
  status: 'active' | 'closed' | 'transferred';
  context: Record<string, unknown>;
  branchId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function rowToSession(r: Record<string, unknown>): ChatSession {
  return {
    id: r.id as string,
    patientId: r.patient_id as string | undefined,
    language: r.language as 'ar' | 'en',
    status: r.status as ChatSession['status'],
    context: (r.context as Record<string, unknown>) ?? {},
    branchId: r.branch_id as number,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function rowToMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function createSession(patientId: string | undefined, language: 'ar' | 'en', branchId: number): Promise<ChatSession> {
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (patient_id, language, branch_id) VALUES ($1, $2, $3) RETURNING *`,
    [patientId ?? null, language, branchId],
  );
  return rowToSession(rows[0] as Record<string, unknown>);
}

export async function getSession(id: string): Promise<ChatSession | null> {
  const { rows } = await pool.query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
  return rows.length ? rowToSession(rows[0] as Record<string, unknown>) : null;
}

export async function getSessionHistory(sessionId: string, limit = 20): Promise<ChatMessage[]> {
  const { rows } = await pool.query(
    `SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [sessionId, limit],
  );
  return (rows as Record<string, unknown>[]).map(rowToMessage);
}

export async function saveMessage(sessionId: string, role: 'user' | 'assistant', content: string, metadata: Record<string, unknown> = {}): Promise<ChatMessage> {
  const { rows } = await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, metadata) VALUES ($1, $2, $3, $4) RETURNING *`,
    [sessionId, role, content, JSON.stringify(metadata)],
  );
  return rowToMessage(rows[0] as Record<string, unknown>);
}

export async function updateSessionContext(id: string, context: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE chat_sessions SET context = $2, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(context)],
  );
}
