export type PaymentStatus = 'pending' | 'verified' | 'approved' | 'paid' | 'reconciled' | 'refunded';
export type Currency = 'EGP' | 'USD' | 'EUR' | 'SAR' | 'AED';

export interface FinancialTransaction {
  id: string; // UUID
  idempotencyKey: string;
  appointmentId?: string;
  patientId: string;
  doctorId?: string;
  procedureId?: string;
  patientSource: string;
  sourceFeePercentage: number;
  sourceFeeAmount: number;
  approvedCharge: number;
  procedureCost?: number;
  grossRevenue: number;
  splitDoctorPercentage: number;
  splitClinicPercentage: number;
  doctorShare: number;
  clinicShare: number;
  paymentMethod?: string;
  paymentStatus: PaymentStatus;
  checkInAmount?: number;
  checkOutAmount?: number;
  isRefund: boolean;
  originalTransactionId?: string;
  refundReason?: string;
  settledAt?: string;
  settledBy?: string;
  settlementReference?: string;
  currencyCode: Currency;
  exchangeRate: number;
  vatRate: number;
  vatAmount: number; // Generated column
  createdAt: string;
  createdBy?: string;
  transactionDate: string;
  branchId: number;
}

export interface CreateTransactionInput {
  idempotencyKey: string;
  appointmentId?: string;
  patientId: string;
  doctorId?: string;
  procedureId?: string;
  patientSource: string;
  approvedCharge: number;
  procedureCost?: number;
  splitDoctorPercentage: number;
  splitClinicPercentage: number;
  paymentMethod?: string;
  currencyCode?: Currency;
}

export interface DoctorSettlement {
  doctorId: string;
  doctorNameEn: string;
  period: { from: string; to: string };
  totalConsultations: number;
  totalProcedures: number;
  grossRevenue: number;
  doctorShare: number;
  clinicShare: number;
  totalSourceFees: number;
  netPayable: number;
  status: PaymentStatus;
  transactions: FinancialTransaction[];
}
