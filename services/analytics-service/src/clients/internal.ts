import { AxiosInstance } from 'axios';
import { createServiceClient } from '@fadl/service-kit';
import { config } from '../config';

function makeClient(baseURL: string, aud: string): AxiosInstance {
  return createServiceClient({
    baseURL,
    aud,
    serviceTokenSecret: config.SERVICE_JWT_SECRET,
    branchId: config.BRANCH_ID,
    sub: '00000000-0000-0000-0000-000000000002',
  });
}

export const billingClient      = makeClient(config.BILLING_SERVICE_URL, 'billing-service');
export const appointmentClient  = makeClient(config.APPOINTMENT_SERVICE_URL, 'appointment-service');
export const patientClient      = makeClient(config.PATIENT_SERVICE_URL, 'patient-service');
export const doctorClient       = makeClient(config.DOCTOR_SERVICE_URL, 'doctor-service');
export const procurementClient  = makeClient(config.PROCUREMENT_SERVICE_URL, 'procurement-service');
