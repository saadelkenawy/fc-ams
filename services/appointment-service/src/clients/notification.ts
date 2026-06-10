import { createServiceClient } from '@fadl/service-kit';
import { config } from '../config';

export const notificationClient = createServiceClient({
  baseURL: config.NOTIFICATION_SERVICE_URL,
  aud: 'notification-service',
  jwtSecret: config.JWT_SECRET,
  branchId: config.BRANCH_ID,
  timeoutMs: 5_000,
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
