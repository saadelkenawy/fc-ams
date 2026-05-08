import nodemailer from 'nodemailer';
import { config } from '../config';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (transport) return transport;
  if (!config.SMTP_HOST) return null;

  transport = nodemailer.createTransport({
    host:   config.SMTP_HOST,
    port:   config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth:   config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
  });
  return transport;
}

export interface EmailPayload {
  to:      string;
  subject: string;
  body:    string;
}

export async function sendEmail(payload: EmailPayload): Promise<'sent' | 'skipped' | 'failed'> {
  const t = getTransport();
  if (!t) {
    console.info('[email] SMTP not configured — skipping delivery for:', payload.to);
    return 'skipped';
  }
  try {
    await t.sendMail({
      from:    config.SMTP_FROM,
      to:      payload.to,
      subject: payload.subject,
      text:    payload.body,
    });
    return 'sent';
  } catch (err) {
    console.error('[email] Send failed:', err);
    return 'failed';
  }
}
