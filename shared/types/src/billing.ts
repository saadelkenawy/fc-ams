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
  visitType?: 'consultation' | 'operative' | 'online';
}

export interface CreateTransactionInput {
  idempotencyKey: string;
  appointmentId?: string;
  patientId: string;
  doctorId?: string;
  procedureId?: string;
  patientSource: string;
  doctorSpecialtyId?: number;
  approvedCharge: number;
  procedureCost?: number;
  splitDoctorPercentage: number;
  splitClinicPercentage: number;
  paymentMethod?: string;
  currencyCode?: Currency;
  visitType?: 'consultation' | 'operative' | 'online';
}

export interface DoctorSettlement {
  doctorId: string;
  doctorNameEn: string;
  period: { from: string; to: string };
  totalConsultations: number;
  totalProcedures: number;
  /** Sum of approvedCharge (base session fees billed to patient) */
  totalSessionFees?: number;
  /** Sum of procedureCost (extra services — added at full cost to net pool) */
  totalExtraServices?: number;
  /** Count of individual extra service line items */
  totalExtraServicesCount?: number;
  /** Net pool = (session fees − mediator cuts) + extra services — what doctor+clinic split */
  grossRevenue: number;
  doctorShare: number;
  clinicShare: number;
  totalSourceFees: number;
  netPayable: number;
  status: PaymentStatus;
  transactions: FinancialTransaction[];
}

export interface SettlementRecord {
  id: string;
  doctorId: string;
  settlementDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  amount: number;
  paymentMethod: string;
  paymentReference: string | null;
  /** External voucher / transaction number (digits only, max 12) entered at settle time. */
  voucherNo: string | null;
  notes: string | null;
  processedByUserId: string | null;
  relatedTransactionIds: string[];
  reversedAt: string | null;
  reversedBy: string | null;
  reversedReason: string | null;
  branchId: number;
  createdAt: string;
}

export interface DoctorCompensationRule {
  id: string;
  doctorId: string;
  visitType: 'consultation' | 'operative' | 'online';
  doctorPercentage: number;
  clinicPercentage: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  branchId: number;
  createdAt: string;
}
