export type RoomAssignmentStatus = 'reserved' | 'active' | 'released' | 'cancelled';

export type RoomStatus = 'available' | 'reserved' | 'occupied' | 'inactive';

// Mirrors appointment-service room.repository RoomRow — the shape GET /rooms
// actually returns (numeric serial id; display name is nameEn/nameAr, not
// "roomName"; the PATCH /rooms/:roomCode/settings *body* still accepts
// `roomName`, which the service maps to name_en).
export interface ClinicRoom {
  id: number;
  code: string;
  roomCode: string | null;
  nameEn: string;
  nameAr: string | null;
  roomType: string;
  floor: number | null;
  description: string | null;
  isActive: boolean;
  branchId: number;
}

// Mirrors appointment-service RoomAssignmentRow.
export interface RoomAssignment {
  id: string;
  roomId: number;
  doctorId: string;
  assignedDate: string;
  assignedFrom: string;
  assignedUntil: string;
  assignedBy: string | null;
  assignedAt: string;
  status: RoomAssignmentStatus;
  releasedAt: string | null;
  branchId: number;
}

export interface RoomDetail extends ClinicRoom {
  status: RoomStatus;
  assignedDoctor: {
    id: string;
    nameEn: string | null;
    nameAr: string | null;
    specialtyNameEn: string | null;
    assignedFrom: string | null;
    assignedUntil: string | null;
  } | null;
  assignmentId: string | null;
  appointmentsToday: number;
  appointmentsRemaining: number;
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
  roomId: number;
  appointmentsUpdated: number;
}

export interface RoomStats {
  roomCode: string;
  appointmentsToday: number;
  avgOccupancyThisMonth: number;
  topDoctorId?: string;
}
