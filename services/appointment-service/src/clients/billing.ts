import axios from 'axios';
import { createHmac } from 'crypto';
import { config } from '../config';

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeServiceToken(): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000001', role: 'admin',
    branchId: config.BRANCH_ID, doctorId: null,
    iat: now, exp: now + 86400,
  }));
  const sig = createHmac('sha256', config.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const billingClient = axios.create({
  baseURL: config.BILLING_SERVICE_URL,
  timeout: 8_000,
  headers: { 'Content-Type': 'application/json' },
});

billingClient.interceptors.request.use((cfg) => {
  cfg.headers.Authorization = `Bearer ${makeServiceToken()}`;
  return cfg;
});

export interface CreateBillingTransactionInput {
  idempotencyKey: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  patientSource: string;
  doctorSpecialtyId?: number | null;
  approvedCharge: number;
  procedureCost?: number;
  splitDoctorPercentage: number;
  splitClinicPercentage: number;
  paymentMethod?: string;
  currencyCode?: string;
}

export async function createBillingTransaction(input: CreateBillingTransactionInput): Promise<void> {
  await billingClient.post('/transactions', {
    idempotencyKey:        input.idempotencyKey,
    appointmentId:         input.appointmentId,
    patientId:             input.patientId,
    doctorId:              input.doctorId,
    patientSource:         input.patientSource,
    doctorSpecialtyId:     input.doctorSpecialtyId ?? undefined,
    approvedCharge:        input.approvedCharge,
    procedureCost:         input.procedureCost ?? undefined,
    splitDoctorPercentage: input.splitDoctorPercentage,
    splitClinicPercentage: input.splitClinicPercentage,
    paymentMethod:         input.paymentMethod ?? undefined,
    currencyCode:          input.currencyCode ?? 'EGP',
  });
}

export async function deleteTransactionByAppointment(appointmentId: string): Promise<void> {
  await billingClient.delete(`/transactions/by-appointment/${appointmentId}`);
}
