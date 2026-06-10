import axios from 'axios';
import { createHmac } from 'crypto';
import { config } from '../config';

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeServiceToken(aud: string): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000001', role: 'admin',
    tokenType: 'service', aud,
    branchId: config.BRANCH_ID, doctorId: null,
    iat: now, exp: now + 120,
  }));
  const sig = createHmac('sha256', config.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export const notificationClient = axios.create({
  baseURL: config.NOTIFICATION_SERVICE_URL,
  timeout: 5_000,
  headers: { 'Content-Type': 'application/json' },
});

notificationClient.interceptors.request.use((cfg) => {
  cfg.headers.Authorization = `Bearer ${makeServiceToken('notification-service')}`;
  return cfg;
});

interface SendPayload {
  channel:        'sms';
  recipientId?:   string;
  recipientType:  'patient';
  recipientMobile?: string;
  body:           string;
  idempotencyKey?: string;
  appointmentId?: string;
  variablesUsed?: Record<string, string>;
}

export async function fireNotification(payload: SendPayload): Promise<void> {
  try {
    await notificationClient.post('/notifications/send', payload);
  } catch {
    // fire-and-forget — never propagate failures
  }
}
