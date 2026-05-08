import { withRlsContext, withTransaction } from '../config/database';
import { config } from '../config';

export interface Notification {
  id: string;
  templateCode?: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'push';
  recipientId?: string;
  recipientType: 'patient' | 'doctor' | 'admin';
  recipientMobile?: string;
  recipientEmail?: string;
  subject?: string;
  body: string;
  variablesUsed: Record<string, string>;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  scheduledAt: string;
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  idempotencyKey?: string;
  appointmentId?: string;
  createdBy?: string;
  createdAt: string;
  branchId: number;
}

export interface SendNotificationInput {
  templateCode?: string;
  channel: Notification['channel'];
  recipientId?: string;
  recipientType?: Notification['recipientType'];
  recipientMobile?: string;
  recipientEmail?: string;
  body: string;
  subject?: string;
  variablesUsed?: Record<string, string>;
  scheduledAt?: string;
  idempotencyKey?: string;
  appointmentId?: string;
}

export interface NotificationTemplate {
  id: number;
  code: string;
  channel: string;
  bodyEn: string;
  bodyAr: string;
  variables: string[];
}

export interface ListNotificationsParams {
  recipientId?: string;
  status?: string;
  channel?: string;
  appointmentId?: string;
  page: number;
  limit: number;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
}

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    templateCode: row.template_code as string | undefined,
    channel: row.channel as Notification['channel'],
    recipientId: row.recipient_id as string | undefined,
    recipientType: row.recipient_type as Notification['recipientType'],
    recipientMobile: row.recipient_mobile as string | undefined,
    recipientEmail: row.recipient_email as string | undefined,
    subject: row.subject as string | undefined,
    body: row.body as string,
    variablesUsed: (row.variables_used as Record<string, string>) ?? {},
    status: row.status as Notification['status'],
    scheduledAt: (row.scheduled_at as Date).toISOString(),
    sentAt: row.sent_at ? (row.sent_at as Date).toISOString() : undefined,
    deliveredAt: row.delivered_at ? (row.delivered_at as Date).toISOString() : undefined,
    errorMessage: row.error_message as string | undefined,
    retryCount: row.retry_count as number,
    maxRetries: row.max_retries as number,
    idempotencyKey: row.idempotency_key as string | undefined,
    appointmentId: row.appointment_id as string | undefined,
    createdBy: row.created_by as string | undefined,
    createdAt: (row.created_at as Date).toISOString(),
    branchId: row.branch_id as number,
  };
}

export async function findNotificationById(id: string): Promise<Notification | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM notifications WHERE id = $1`,
      [id],
    );
    return rows.length ? rowToNotification(rows[0] as Record<string, unknown>) : null;
  });
}

export async function listNotifications(params: ListNotificationsParams): Promise<PaginatedNotifications> {
  const page = Math.max(params.page, 1);
  const limit = Math.min(params.limit, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.recipientId) {
      conditions.push(`recipient_id = $${idx++}`);
      values.push(params.recipientId);
    }
    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }
    if (params.channel) {
      conditions.push(`channel = $${idx++}`);
      values.push(params.channel);
    }
    if (params.appointmentId) {
      conditions.push(`appointment_id = $${idx++}`);
      values.push(params.appointmentId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM notifications ${where}`, values),
      client.query(
        `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    return {
      data: dataRows.map((r) => rowToNotification(r as Record<string, unknown>)),
      total,
      page,
      limit,
    };
  });
}

export async function markSent(id: string): Promise<void> {
  await withRlsContext(async (client) => {
    await client.query(
      `UPDATE notifications SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id],
    );
  });
}

export async function markFailed(id: string, error: string): Promise<void> {
  await withRlsContext(async (client) => {
    await client.query(
      `UPDATE notifications SET status = 'failed', error_message = $2, retry_count = retry_count + 1 WHERE id = $1`,
      [id, error],
    );
  });
}

export async function createNotification(
  input: SendNotificationInput,
  createdBy: string,
): Promise<Notification> {
  const notif = await withTransaction(async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `INSERT INTO notifications (
        template_code, channel, recipient_id, recipient_type,
        recipient_mobile, recipient_email, subject, body,
        variables_used, scheduled_at, idempotency_key,
        appointment_id, created_by, branch_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *`,
      [
        input.templateCode ?? null,
        input.channel,
        input.recipientId ?? null,
        input.recipientType ?? 'patient',
        input.recipientMobile ?? null,
        input.recipientEmail ?? null,
        input.subject ?? null,
        input.body,
        JSON.stringify(input.variablesUsed ?? {}),
        input.scheduledAt ?? null,
        input.idempotencyKey ?? null,
        input.appointmentId ?? null,
        createdBy,
        config.BRANCH_ID,
      ],
    );

    if (rows.length === 0 && input.idempotencyKey) {
      // Idempotency conflict — return the existing record
      const { rows: existing } = await client.query<Record<string, unknown>>(
        `SELECT * FROM notifications WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      if (existing.length) return rowToNotification(existing[0]);
    }

    return rowToNotification(rows[0] as Record<string, unknown>);
  });

  // Phase 1: log to console, mark as sent immediately
  console.info(
    `[notification-service] Would send ${input.channel} to ${input.recipientMobile ?? input.recipientEmail}: ${input.body}`,
  );
  await markSent(notif.id);

  const updated = await findNotificationById(notif.id);
  if (!updated) {
    throw Object.assign(new Error('Notification not found after insert'), { statusCode: 500 });
  }
  return updated;
}

export async function retryNotification(id: string): Promise<Notification> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM notifications WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      throw Object.assign(new Error('Notification not found'), { code: 'NOTIFICATION_NOT_FOUND', statusCode: 404 });
    }

    const notif = rowToNotification(rows[0]);

    if (notif.retryCount >= notif.maxRetries) {
      throw Object.assign(
        new Error(`Max retries (${notif.maxRetries}) reached`),
        { code: 'MAX_RETRIES_REACHED', statusCode: 422 },
      );
    }

    const { rows: updated } = await client.query<Record<string, unknown>>(
      `UPDATE notifications SET status = 'queued', scheduled_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );

    return rowToNotification(updated[0]);
  });
}

export async function getTemplates(): Promise<NotificationTemplate[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT id, code, channel, body_en, body_ar, variables FROM notification_templates WHERE is_active = TRUE ORDER BY code, channel`,
    );
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as number,
      code: r.code as string,
      channel: r.channel as string,
      bodyEn: r.body_en as string,
      bodyAr: r.body_ar as string,
      variables: (r.variables as string[]) ?? [],
    }));
  });
}
