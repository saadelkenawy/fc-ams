export type RxForm      = 'cap' | 'tab' | 'syr' | 'inj' | 'gtt';
export type RxFrequency = 'od' | 'bid' | 'tid' | 'qid' | 'q4h';
export type RxTiming    = 'ac' | 'pc' | 'hs' | 'stat' | 'prn' | 'none';
export type PrescriptionStatus = 'active' | 'dispensed' | 'cancelled';

export interface PrescriptionItem {
  id: string;
  prescriptionId: string;
  medicationId?: string;
  medicationName: string;
  form: RxForm;
  dosageValue?: number;
  dosageUnit?: string;
  frequency: RxFrequency;
  timing: RxTiming;
  routeInstruction?: string;
  durationDays?: number;
  dispenseQuantity?: number;
  sortOrder: number;
  createdAt: string;
}

export interface Prescription {
  id: string;
  branchId: number;
  encounterId?: string;
  patientId: string;
  doctorId: string;
  diagnosis?: string;
  status: PrescriptionStatus;
  notes?: string;
  items: PrescriptionItem[];
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrescriptionInput {
  encounterId?: string;
  patientId: string;
  doctorId: string;
  diagnosis?: string;
  notes?: string;
  items: CreatePrescriptionItemInput[];
}

export interface CreatePrescriptionItemInput {
  medicationId?: string;
  medicationName: string;
  form: RxForm;
  dosageValue?: number;
  dosageUnit?: string;
  frequency: RxFrequency;
  timing?: RxTiming;
  routeInstruction?: string;
  durationDays?: number;
  dispenseQuantity?: number;
  sortOrder?: number;
}

export interface MedicationDictionaryEntry {
  id: string;
  genericName: string;
  brandName?: string;
  availableForms: RxForm[];
}
