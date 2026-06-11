import { createServiceClient } from '@fadl/service-kit';
import { config } from '../config';

const billingClient = createServiceClient({
  baseURL: config.BILLING_SERVICE_URL,
  aud: 'billing-service',
  serviceTokenSecret: config.SERVICE_JWT_SECRET,
  branchId: config.BRANCH_ID,
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
  visitType?: 'consultation' | 'operative' | 'online';
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
    visitType:             input.visitType ?? undefined,
  });
}

export async function syncBillingPaymentStatus(appointmentId: string, status: string): Promise<void> {
  await billingClient.patch(`/transactions/by-appointment/${appointmentId}/payment-status`, { status });
}

export async function refundTransactionByAppointment(appointmentId: string): Promise<void> {
  await billingClient.patch(`/transactions/by-appointment/${appointmentId}/refund`, {});
}

export async function syncBillingApprovedCharge(appointmentId: string, approvedCharge: number): Promise<void> {
  await billingClient.patch(`/transactions/by-appointment/${appointmentId}/charge`, { approvedCharge });
}
