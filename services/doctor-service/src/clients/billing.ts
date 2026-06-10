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

export async function setCompensation(
  doctorId: string,
  visitType: 'consultation' | 'operative' | 'online',
  doctorPercentage: number,
  clinicPercentage: number,
  applyToExisting = true,
): Promise<void> {
  const res = await fetch(`${config.BILLING_SERVICE_URL}/compensation/${doctorId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${makeServiceToken('billing-service')}`,
    },
    body: JSON.stringify({
      visitType,
      doctorPercentage,
      clinicPercentage,
      effectiveFrom: new Date().toISOString().split('T')[0],
      applyToExisting,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`billing-service setCompensation failed (${res.status}): ${text}`);
  }
}
