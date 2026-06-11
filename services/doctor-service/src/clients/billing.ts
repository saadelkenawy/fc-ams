import { makeServiceToken as mintToken } from '@fadl/service-kit';
import { config } from '../config';

function makeServiceToken(aud: string): string {
  return mintToken(aud, { serviceTokenSecret: config.SERVICE_JWT_SECRET, branchId: config.BRANCH_ID });
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
