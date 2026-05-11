import type { DoctorStatus } from './doctor';

export type RoomAssignmentStatus = 'reserved' | 'active' | 'released' | 'cancelled';

export interface ClinicRoom {
  id: string;
  roomCode: string;
  roomName: string;
  floor?: number;
  description?: string;
  isActive: boolean;
  branchId: number;
  createdAt: string;
}

export interface RoomAssignment {
  id: string;
  roomId: string;
  doctorId: string;
  assignedDate: string;
  assignedFrom: string;
  assignedUntil: string;
  assignedBy?: string;
  assignedAt: string;
  status: RoomAssignmentStatus;
  releasedAt?: string;
  branchId: number;
  createdAt: string;
  updatedAt: string;
}

export type RoomStatus = 'available' | 'reserved' | 'occupied' | 'inactive';

export interface RoomDetail extends ClinicRoom {
  status: RoomStatus;
  assignedDoctor: {
    id: string;
    nameEn?: string;
    nameAr?: string;
    specialtyNameEn?: string;
    doctorStatus?: DoctorStatus;
  } | null;
  appointmentsToday: number;
  appointmentsRemaining: number;
  assignmentId: string | null;
}

export interface RoomScheduleEntry {
  appointmentId: string;
  patientId: string;
  patientNameEn: string;
  patientNameAr?: string;
  startTime: string;
  endTime: string;
  status: string;
  enteredAt?: string;
  exitedAt?: string;
}

export interface RoomSchedule {
  room: ClinicRoom;
  date: string;
  appointments: RoomScheduleEntry[];
}

export interface AssignRoomResult {
  assignment: RoomAssignment;
  roomCode: string;
  roomName: string;
  appointmentsUpdated: number;
}

export interface RoomStats {
  roomCode: string;
  appointmentsToday: number;
  avgOccupancyThisMonth: number;
  topDoctorId?: string;
  topDoctorNameEn?: string;
}
