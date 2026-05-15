/**
 * One-time backfill script: populate doctor_compensation from doctor-service revenue_splits
 *
 * Usage (from billing-service directory):
 *   DOCTOR_SERVICE_URL=http://localhost:3003/api/v1 \
 *   BILLING_SERVICE_URL=http://localhost:3004/api/v1 \
 *   JWT_SECRET=<same_secret_as_services> \
 *   npx ts-node --transpile-only scripts/backfill-compensation.ts
 *
 * Or inside Docker network (from host with port-forwarded services):
 *   DOCTOR_SERVICE_URL=http://localhost:3003/api/v1 \
 *   BILLING_SERVICE_URL=http://localhost:3004/api/v1 \
 *   ...
 */

import { createHmac } from 'crypto';

const DOCTOR_SERVICE_URL = process.env.DOCTOR_SERVICE_URL ?? 'http://doctor-service:3003/api/v1';
const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL ?? 'http://billing-service:3004/api/v1';
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const BRANCH_ID = Number(process.env.BRANCH_ID ?? 1);

if (!JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeServiceToken(): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000001', role: 'admin',
    branchId: BRANCH_ID, doctorId: null,
    iat: now, exp: now + 86400,
  }));
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${makeServiceToken()}`,
};

const today = new Date().toISOString().split('T')[0];

interface RevenueSplit { doctorPercentage: number; clinicPercentage: number; }
interface Doctor {
  id: string;
  nameEn: string;
  isActive: boolean;
  revenueSplits: { consultation: RevenueSplit; operative: RevenueSplit; online: RevenueSplit };
}

async function fetchAllDoctors(): Promise<Doctor[]> {
  const doctors: Doctor[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${DOCTOR_SERVICE_URL}/doctors?page=${page}&limit=100`, { headers });
    if (!res.ok) throw new Error(`Doctor service responded ${res.status}`);
    const body = await res.json() as { data: { data: Doctor[]; totalPages: number } };
    const { data, totalPages } = body.data;
    doctors.push(...data);
    if (page >= totalPages) break;
    page++;
  }
  return doctors;
}

async function setCompensation(
  doctorId: string,
  visitType: string,
  doctorPercentage: number,
  clinicPercentage: number,
): Promise<void> {
  const res = await fetch(`${BILLING_SERVICE_URL}/compensation/${doctorId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ visitType, doctorPercentage, clinicPercentage, effectiveFrom: today, applyToExisting: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Billing service responded ${res.status}: ${text}`);
  }
}

async function main() {
  console.log('Fetching all doctors...');
  const doctors = await fetchAllDoctors();
  console.log(`Found ${doctors.length} doctors`);

  let ok = 0, fail = 0;
  for (const doctor of doctors) {
    const { consultation, operative, online } = doctor.revenueSplits;
    console.log(`Processing ${doctor.nameEn} (${doctor.id})`);
    const results = await Promise.allSettled([
      setCompensation(doctor.id, 'consultation', consultation.doctorPercentage, consultation.clinicPercentage),
      setCompensation(doctor.id, 'operative',    operative.doctorPercentage,    operative.clinicPercentage),
      setCompensation(doctor.id, 'online',       online.doctorPercentage,       online.clinicPercentage),
    ]);
    for (const [i, r] of results.entries()) {
      const type = ['consultation', 'operative', 'online'][i];
      if (r.status === 'rejected') {
        console.error(`  FAIL ${type}: ${(r.reason as Error).message}`);
        fail++;
      } else {
        console.log(`  OK   ${type}`);
        ok++;
      }
    }
  }

  console.log(`\nDone. ${ok} OK, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
