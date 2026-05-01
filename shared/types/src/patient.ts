export type Gender = 'M' | 'F';
export type PreferredLanguage = 'ar' | 'en';
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface Patient {
  patientId: string; // UUID — never mobile as PK
  mobile: string;
  mobileHistory: string[];
  nationalId?: string;
  nameEn: string;
  nameAr?: string;
  dateOfBirth?: string; // ISO date
  gender?: Gender;
  bloodType?: BloodType;
  address?: string;
  email?: string;
  emergencyContactMobile?: string;
  emergencyContactName?: string;
  preferredLanguage: PreferredLanguage;
  sourceFirstVisit?: string;
  deletedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  branchId: number;
}

export interface CreatePatientInput {
  mobile: string;
  nameEn: string;
  nameAr?: string;
  nationalId?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodType?: BloodType;
  address?: string;
  email?: string;
  emergencyContactMobile?: string;
  emergencyContactName?: string;
  preferredLanguage?: PreferredLanguage;
  sourceFirstVisit?: string;
}

export interface UpdatePatientInput extends Partial<CreatePatientInput> {
  version: number; // Required for optimistic concurrency
}

export interface PatientSearchParams {
  query?: string; // mobile, name, national ID
  mobile?: string;
  nationalId?: string;
  branchId?: number;
  page?: number;
  limit?: number;
}
