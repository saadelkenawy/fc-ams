import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { config } from '../config';

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeServiceToken(): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000002',
    role: 'admin',
    branchId: config.BRANCH_ID,
    doctorId: null,
    iat: now,
    exp: now + 86400,
  }));
  const sig = createHmac('sha256', config.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function makeClient(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 8_000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Refresh the service token on every request so it never expires mid-deployment
  instance.interceptors.request.use((reqConfig) => {
    reqConfig.headers.Authorization = `Bearer ${makeServiceToken()}`;
    return reqConfig;
  });

  return instance;
}

export const billingClient      = makeClient(config.BILLING_SERVICE_URL);
export const appointmentClient  = makeClient(config.APPOINTMENT_SERVICE_URL);
export const patientClient      = makeClient(config.PATIENT_SERVICE_URL);
export const doctorClient       = makeClient(config.DOCTOR_SERVICE_URL);
export const procurementClient  = makeClient(config.PROCUREMENT_SERVICE_URL);
