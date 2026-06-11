import { AxiosInstance } from 'axios';
import { createServiceClient } from '@fadl/service-kit';
import { config } from '../config';

function makeClient(baseURL: string, aud: string): AxiosInstance {
  return createServiceClient({
    baseURL,
    aud,
    serviceTokenSecret: config.SERVICE_JWT_SECRET,
    branchId: config.BRANCH_ID,
    sub: '00000000-0000-0000-0000-000000000003',
    timeoutMs: 10_000,
  });
}

export const appointmentClient = makeClient(config.APPOINTMENT_SERVICE_URL, 'appointment-service');
export const billingClient     = makeClient(config.BILLING_SERVICE_URL, 'billing-service');
export const patientClient     = makeClient(config.PATIENT_SERVICE_URL, 'patient-service');
