import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { createHmac } from 'crypto';
import { config } from '../config';

function base64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeServiceToken(aud: string): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000003', role: 'admin',
    tokenType: 'service', aud,
    branchId: config.BRANCH_ID, doctorId: null,
    iat: now, exp: now + 120,
  }));
  const sig = createHmac('sha256', config.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function makeClient(baseURL: string, aud: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 10_000, headers: { 'Content-Type': 'application/json' } });
  client.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    cfg.headers.Authorization = `Bearer ${makeServiceToken(aud)}`;
    return cfg;
  });
  return client;
}

export const appointmentClient = makeClient(config.APPOINTMENT_SERVICE_URL, 'appointment-service');
export const billingClient     = makeClient(config.BILLING_SERVICE_URL, 'billing-service');
export const patientClient     = makeClient(config.PATIENT_SERVICE_URL, 'patient-service');
