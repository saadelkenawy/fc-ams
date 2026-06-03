import type { SubscriptionTier } from './feature-flags';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  messageAr?: string;
  details?: Record<string, unknown>;
}

export interface AuditInfo {
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  version: number;
}

export interface LocalizedText {
  en: string;
  ar?: string;
}

export interface Branch {
  id: number;
  nameEn: string;
  nameAr: string;
  address?: string;
  phone?: string;
  isActive: boolean;
}

export type UserRole = 'admin' | 'finance' | 'doctor' | 'receptionist' | 'patient' | 'procurement';

export interface JwtPayload {
  sub: string; // user ID
  role: UserRole;
  branchId: number;
  doctorId?: string; // set when role = doctor
  subscriptionTier?: SubscriptionTier;
  iat: number;
  exp: number;
}
