export type DoctorPaymentMethod = 'cash' | 'instapay' | 'bank_transfer' | 'vfc_wallet' | 'mobile_wallet';
export type SettlementStatus = 'pending' | 'verified' | 'approved' | 'paid' | 'reconciled';

export interface RevenueSplit {
  doctorPercentage: number;
  clinicPercentage: number;
}

export interface VisitTypeSplits {
  consultation: RevenueSplit;
  operative: RevenueSplit;
  online: RevenueSplit;
}

export interface DoctorRevenueSplits extends VisitTypeSplits {
  /** Per-specialty overrides keyed by specialtyId — used when the doctor
   *  practices multiple specialties; absent keys fall back to the base splits. */
  bySpecialty?: Record<string, VisitTypeSplits>;
}

export interface Doctor {
  id: string; // UUID
  mobile: string;
  nameEn: string;
  nameAr?: string;
  specialtyId: number;
  /** Additional specialties beyond the primary specialtyId. */
  secondarySpecialtyIds: number[];
  subSpecialty?: string;
  isOnlineDoctor: boolean;
  revenueSplits: DoctorRevenueSplits;
  paymentMethod?: DoctorPaymentMethod;
  allowOverbooking: boolean;
  overbookingBufferPercentage: number; // 0–15
  isActive: boolean;
  deletedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  branchId: number;
}

export interface DoctorSchedule {
  id: string;
  doctorId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  startTime: string; // HH:MM
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  validFrom: string;
  validUntil?: string;
  branchId: number;
}

export interface DoctorScheduleOverride {
  id: string;
  doctorId: string;
  overrideDate: string; // ISO date
  overrideType: 'unavailable' | 'custom_hours' | 'holiday';
  customStartTime?: string;
  customEndTime?: string;
  reason?: string;
  notifyPatients: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface Specialty {
  id: number;
  code: string; // e.g. "GYN", "DENT"
  nameEn: string;
  nameAr: string;
  category?: string;
  isActive: boolean;
}

export type DoctorStatus = 'active' | 'absent' | 'on_his_way' | 'day_off';

export interface DoctorConsultationHours {
  id: string;
  doctorId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string; // HH:MM
  endTime: string;
  slotDurationMins: number;
  maxPatients: number;
  isActive: boolean;
  branchId: number;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorStatusLog {
  id: string;
  doctorId: string;
  previousStatus?: DoctorStatus;
  newStatus: DoctorStatus;
  note?: string;
  changedBy?: string;
  changedAt: string;
  branchId: number;
}

export interface DoctorDayOverride {
  id: string;
  doctorId: string;
  overrideDate: string; // ISO date
  isWorking: boolean;
  startTime?: string;
  endTime?: string;
  maxPatients?: number;
  reason?: string;
  createdBy?: string;
  createdAt: string;
  branchId: number;
}

export interface DoctorAvailabilitySlot {
  time: string; // HH:MM
  available: boolean;
}

export interface DoctorAvailability {
  doctorId: string;
  date: string;
  /** Whether the doctor has ANY working-hours configuration (consultation
   *  hours or day overrides). Appointment validation only enforces working
   *  hours for doctors who actually have a schedule configured. */
  hasSchedule: boolean;
  isWorking: boolean;
  /** Clinic working window for this day (HH:MM) — null when not working.
   *  Total bookable slots for a chosen session length =
   *  floor((workEnd − workStart) / sessionMinutes). */
  workStart: string | null;
  workEnd: string | null;
  slots: DoctorAvailabilitySlot[];
  totalSlots: number;
  bookedSlots: number;
  maxPatients: number;
}
