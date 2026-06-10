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

function makeServiceToken(aud: string): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000002',
    role: 'admin',
    tokenType: 'service',
    aud,
    branchId: config.BRANCH_ID,
    doctorId: null,
    iat: now,
    exp: now + 120,
  }));
  const sig = createHmac('sha256', config.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function makeClient(baseURL: string, aud: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 8_000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Refresh the service token on every request so it never expires mid-deployment
  instance.interceptors.request.use((reqConfig) => {
    reqConfig.headers.Authorization = `Bearer ${makeServiceToken(aud)}`;
    return reqConfig;
  });

  return instance;
}

export const billingClient      = makeClient(config.BILLING_SERVICE_URL, 'billing-service');
export const appointmentClient  = makeClient(config.APPOINTMENT_SERVICE_URL, 'appointment-service');
export const patientClient      = makeClient(config.PATIENT_SERVICE_URL, 'patient-service');
export const doctorClient       = makeClient(config.DOCTOR_SERVICE_URL, 'doctor-service');
export const procurementClient  = makeClient(config.PROCUREMENT_SERVICE_URL, 'procurement-service');
