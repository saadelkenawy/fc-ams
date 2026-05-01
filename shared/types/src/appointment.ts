export type AppointmentStatus = 'TBC' | 'Ok!' | 'Conf.' | 'Comp.' | 'Canc.' | 'Resch.' | 'Inf.';
export type AppointmentType = 'in_person' | 'online' | 'walk_in';

export type PatientSource =
  | "Cl.'s"   // Clinic direct
  | "Dr.'s"   // Doctor referral
  | 'VEZ'     // Vizita
  | 'Ex-VEZ'  // Ex-Vizita
  | 'EKF'     // Ekshf
  | 'Ex-EKF'  // Ex-Ekshf
  | 'DO'      // CliniDo
  | 'Ex-DO'   // Ex-CliniDo
  | 'SHL';    // Shamel

export interface Appointment {
  id: string; // UUID
  patientId: string; // FK to patients.patient_id (UUID)
  doctorId: string;
  specialtyId: number;
  appointmentDate: string; // ISO date
  startTime: string; // HH:MM
  endTime: string;
  timeZone: string;
  status: AppointmentStatus;
  appointmentType: AppointmentType;
  isOnline: boolean;
  isOverbooked: boolean;
  patientSource: PatientSource;
  procedureId?: string;
  approvedCharge?: number;
  procedureCost?: number;
  queueNumber?: number;
  checkedInAt?: string;
  checkedOutAt?: string;
  waitingTimeMinutes?: number;
  originalAppointmentId?: string; // Reschedule chain
  rescheduleCount: number;
  idempotencyKey?: string;
  version: number;
  deletedAt?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  branchId: number;
}

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  specialtyId: number;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  appointmentType?: AppointmentType;
  patientSource: PatientSource;
  procedureId?: string;
  approvedCharge?: number;
  notes?: string;
  idempotencyKey: string;
}

export interface AppointmentStatusTransition {
  appointmentId: string;
  newStatus: AppointmentStatus;
  version: number;
  reason?: string;
}

export interface QueueEntry {
  appointmentId: string;
  patientId: string;
  patientNameEn: string;
  patientNameAr?: string;
  doctorId: string;
  status: AppointmentStatus;
  queueNumber: number;
  appointmentType: AppointmentType;
  checkedInAt?: string;
  estimatedWaitMinutes?: number;
}
