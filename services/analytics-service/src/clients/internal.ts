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
    sub: 'analytics-service',
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
  return axios.create({
    baseURL,
    timeout: 8_000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${makeServiceToken()}`,
    },
  });
}

export const billingClient     = makeClient(config.BILLING_SERVICE_URL);
export const appointmentClient = makeClient(config.APPOINTMENT_SERVICE_URL);
export const patientClient     = makeClient(config.PATIENT_SERVICE_URL);
