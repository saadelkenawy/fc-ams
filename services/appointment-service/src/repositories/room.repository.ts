import { v4 as uuidv4 } from 'uuid';
import { withTransaction, withRlsContext, pool } from '../config/database';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoomRow {
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

export type RoomStatus = 'available' | 'reserved' | 'occupied' | 'inactive';

export interface RoomAssignmentRow {
  id: string;
  roomId: number;
  doctorId: string;
  assignedDate: string;
  assignedFrom: string;
  assignedUntil: string;
  assignedBy: string | null;
  assignedAt: string;
  status: string;
  releasedAt: string | null;
  branchId: number;
}

export interface RoomDetail extends RoomRow {
  status: RoomStatus;
  assignedDoctor: {
    id: string;
    nameEn: string | null;
    nameAr: string | null;
    specialtyNameEn: string | null;
    assignedFrom: string | null;
    assignedUntil: string | null;
    doctorStatus?: string;
  } | null;
  assignmentId: string | null;
  appointmentsToday: number;
  appointmentsRemaining: number;
}

export interface NextPatientResult {
  completed: {
    appointmentId: string;
    patientId: string;
    doctorId: string;
    patientSource: string;
    approvedCharge: number;
    splitDoctorPercentage: number;
    splitClinicPercentage: number;
    specialtyId: number | null;
    durationMins: number;
    sessionStart: string | null;
    appointmentType: string | null;
  };
  next: {
    queueId: string;
    appointmentId: string;
    patientId: string;
    position: number;
  } | null;
}

export interface AssignRoomResult {
  assignment: RoomAssignmentRow;
  roomCode: string;
  roomName: string;
  roomId: number;
  appointmentsUpdated: number;
}

// ── Row mappers ──────────────────────────────────────────────────────────────

function rowToRoomRow(r: Record<string, unknown>): RoomRow {
  return {
    id: r.id as number,
    code: r.code as string,
    roomCode: r.room_code as string | null,
    nameEn: r.name_en as string,
    nameAr: r.name_ar as string | null,
    roomType: r.room_type as string,
    floor: r.floor as number | null,
    description: r.description as string | null,
    isActive: r.is_active as boolean,
    branchId: r.branch_id as number,
  };
}

function rowToAssignment(r: Record<string, unknown>): RoomAssignmentRow {
  return {
    id: r.id as string,
    roomId: r.room_id as number,
    doctorId: r.doctor_id as string,
    assignedDate: (r.assigned_date as Date).toISOString().split('T')[0],
    assignedFrom: r.assigned_from as string,
    assignedUntil: r.assigned_until as string,
    assignedBy: r.assigned_by as string | null,
    assignedAt: (r.assigned_at as Date).toISOString(),
    status: r.status as string,
    releasedAt: r.released_at ? (r.released_at as Date).toISOString() : null,
    branchId: r.branch_id as number,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listRooms(date: string, branchId: number): Promise<RoomDetail[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT
         cr.*,
         ra.id             AS assignment_id,
         ra.status         AS assignment_status,
         ra.doctor_id,
         ra.assigned_from,
         ra.assigned_until,
         d.name_en         AS doctor_name_en,
         d.name_ar         AS doctor_name_ar,
         s.name_en         AS specialty_name_en,
         COUNT(al.id) FILTER (WHERE al.assigned_date = $1)                          AS appointments_today,
         COUNT(al.id) FILTER (WHERE al.assigned_date = $1 AND al.exited_at IS NULL) AS remaining
       FROM clinic_rooms cr
       LEFT JOIN room_assignments ra
         ON ra.room_id = cr.id AND ra.assigned_date = $1 AND ra.status IN ('reserved','active')
       LEFT JOIN doctors d ON d.id = ra.doctor_id
       LEFT JOIN specialties s ON s.id = d.specialty_id
       LEFT JOIN room_appointment_log al ON al.room_id = cr.id
       WHERE cr.branch_id = $2 AND cr.room_type = 'clinical' AND cr.room_code IS NOT NULL
       GROUP BY cr.id, ra.id, ra.status, ra.doctor_id, ra.assigned_from, ra.assigned_until,
                d.name_en, d.name_ar, s.name_en
       ORDER BY cr.room_code`,
      [date, branchId],
    );

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const assignStatus = row.assignment_status as string | null;
      let status: RoomStatus = 'available';
      if (!(row.is_active as boolean)) status = 'inactive';
      else if (assignStatus === 'active') status = 'occupied';
      else if (assignStatus === 'reserved') status = 'reserved';

      return {
        ...rowToRoomRow(row),
        status,
        assignedDoctor: row.doctor_id
          ? {
              id: row.doctor_id as string,
              nameEn: (row.doctor_name_en as string | null) ?? null,
              nameAr: (row.doctor_name_ar as string | null) ?? null,
              specialtyNameEn: (row.specialty_name_en as string | null) ?? null,
              assignedFrom: (row.assigned_from as string | null) ?? null,
              assignedUntil: (row.assigned_until as string | null) ?? null,
            }
          : null,
        assignmentId: row.assignment_id as string | null,
        appointmentsToday: Number(row.appointments_today ?? 0),
        appointmentsRemaining: Number(row.remaining ?? 0),
      };
    });
  });
}

export async function getRoomByCode(roomCode: string, branchId: number): Promise<RoomRow | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM clinic_rooms WHERE room_code = $1 AND branch_id = $2 AND is_active = TRUE`,
      [roomCode, branchId],
    );
    return rows.length ? rowToRoomRow(rows[0] as Record<string, unknown>) : null;
  });
}

export async function getActiveAssignment(doctorId: string, date: string): Promise<RoomAssignmentRow | null> {
  const { rows } = await pool.query(
    `SELECT ra.*, cr.room_code FROM room_assignments ra
     JOIN clinic_rooms cr ON cr.id = ra.room_id
     WHERE ra.doctor_id = $1 AND ra.assigned_date = $2 AND ra.status IN ('reserved','active')
     LIMIT 1`,
    [doctorId, date],
  );
  return rows.length ? rowToAssignment(rows[0] as Record<string, unknown>) : null;
}

export async function getAvailabilityByDate(date: string, branchId: number): Promise<{ roomCode: string; status: string }[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT cr.room_code,
              CASE WHEN ra.id IS NULL THEN 'available'
                   WHEN ra.status = 'active' THEN 'occupied'
                   ELSE 'reserved' END AS status
       FROM clinic_rooms cr
       LEFT JOIN room_assignments ra
         ON ra.room_id = cr.id AND ra.assigned_date = $1 AND ra.status IN ('reserved','active')
       WHERE cr.branch_id = $2 AND cr.is_active = TRUE AND cr.room_code IS NOT NULL
       ORDER BY cr.room_code`,
      [date, branchId],
    );
    return rows.map((r) => ({
      roomCode: (r as Record<string, unknown>).room_code as string,
      status: (r as Record<string, unknown>).status as string,
    }));
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function assignRoom(
  roomCode: string,
  doctorId: string,
  date: string,
  fromTime: string,
  untilTime: string,
  assignedBy: string,
  branchId: number,
): Promise<AssignRoomResult> {
  return withTransaction(async (client) => {
    const { rows: roomRows } = await client.query(
      `SELECT * FROM clinic_rooms WHERE room_code = $1 AND branch_id = $2 AND is_active = TRUE FOR UPDATE`,
      [roomCode, branchId],
    );
    if (!roomRows.length) {
      throw Object.assign(new Error(`Room ${roomCode} not found or inactive`), { statusCode: 404, code: 'ROOM_NOT_FOUND' });
    }
    const room = rowToRoomRow(roomRows[0] as Record<string, unknown>);

    const { rows: conflicts } = await client.query(
      `SELECT id FROM room_assignments WHERE room_id = $1 AND assigned_date = $2 AND status IN ('reserved','active')`,
      [room.id, date],
    );
    if (conflicts.length) {
      throw Object.assign(new Error(`Room ${roomCode} is already assigned on ${date}`), { statusCode: 409, code: 'ROOM_ALREADY_ASSIGNED' });
    }

    const { rows: doctorConflicts } = await client.query(
      `SELECT ra.id, cr.room_code FROM room_assignments ra
       JOIN clinic_rooms cr ON cr.id = ra.room_id
       WHERE ra.doctor_id = $1 AND ra.assigned_date = $2 AND ra.status IN ('reserved','active')`,
      [doctorId, date],
    );
    if (doctorConflicts.length) {
      const existing = (doctorConflicts[0] as Record<string, unknown>).room_code;
      throw Object.assign(new Error(`Doctor already assigned to room ${existing} on ${date}`), { statusCode: 409, code: 'DOCTOR_ALREADY_HAS_ROOM' });
    }

    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO room_assignments
         (id, room_id, doctor_id, assigned_date, assigned_from, assigned_until, assigned_by, status, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8) RETURNING *`,
      [id, room.id, doctorId, date, fromTime, untilTime, assignedBy, branchId],
    );

    const { rowCount } = await client.query(
      `UPDATE appointments
       SET room_id = $1, room_code = $2, room_assigned_at = NOW(), updated_at = NOW()
       WHERE doctor_id = $3 AND appointment_date = $4
         AND status NOT IN ('Comp.','Canc.','Resch.') AND deleted_at IS NULL`,
      [room.id, room.roomCode, doctorId, date],
    );

    return {
      assignment: rowToAssignment(rows[0] as Record<string, unknown>),
      roomCode: room.roomCode ?? room.code,
      roomName: room.nameEn,
      roomId: room.id,
      appointmentsUpdated: rowCount ?? 0,
    };
  });
}

export async function autoAssignRoom(
  doctorId: string,
  date: string,
  fromTime: string,
  untilTime: string,
  assignedBy: string,
  branchId: number,
): Promise<AssignRoomResult | null> {
  return withTransaction(async (client) => {
    const { rows: allRooms } = await client.query(
      `SELECT cr.* FROM clinic_rooms cr
       WHERE cr.branch_id = $1 AND cr.is_active = TRUE AND cr.room_code IS NOT NULL
       ORDER BY cr.room_code
       FOR UPDATE`,
      [branchId],
    );
    if (!allRooms.length) return null;

    const { rows: taken } = await client.query(
      `SELECT room_id FROM room_assignments WHERE assigned_date = $1 AND status IN ('reserved','active')`,
      [date],
    );
    const takenIds = new Set(taken.map((r) => (r as Record<string, unknown>).room_id as number));

    const available = (allRooms as Record<string, unknown>[]).find((r) => !takenIds.has(r.id as number));
    if (!available) return null;

    const room = rowToRoomRow(available);

    const { rows: doctorConflicts } = await client.query(
      `SELECT id FROM room_assignments WHERE doctor_id = $1 AND assigned_date = $2 AND status IN ('reserved','active')`,
      [doctorId, date],
    );
    if (doctorConflicts.length) return null;

    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO room_assignments
         (id, room_id, doctor_id, assigned_date, assigned_from, assigned_until, assigned_by, status, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8) RETURNING *`,
      [id, room.id, doctorId, date, fromTime, untilTime, assignedBy, branchId],
    );

    const { rowCount } = await client.query(
      `UPDATE appointments
       SET room_id = $1, room_code = $2, room_assigned_at = NOW(), updated_at = NOW()
       WHERE doctor_id = $3 AND appointment_date = $4
         AND status NOT IN ('Comp.','Canc.','Resch.') AND deleted_at IS NULL`,
      [room.id, room.roomCode, doctorId, date],
    );

    return {
      assignment: rowToAssignment(rows[0] as Record<string, unknown>),
      roomCode: room.roomCode ?? room.code,
      roomName: room.nameEn,
      roomId: room.id,
      appointmentsUpdated: rowCount ?? 0,
    };
  });
}

export async function activateReservedRoom(doctorId: string, date: string): Promise<RoomAssignmentRow | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE room_assignments SET status = 'active', updated_at = NOW()
       WHERE doctor_id = $1 AND assigned_date = $2 AND status = 'reserved'
       RETURNING *`,
      [doctorId, date],
    );
    return rows.length ? rowToAssignment(rows[0] as Record<string, unknown>) : null;
  });
}

export async function releaseRoom(
  doctorId: string,
  date: string,
  branchId: number,
): Promise<{ assignment: RoomAssignmentRow; roomCode: string } | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE room_assignments ra
       SET status = 'cancelled', released_at = NOW(), updated_at = NOW()
       FROM clinic_rooms cr
       WHERE ra.room_id = cr.id
         AND ra.doctor_id = $1 AND ra.assigned_date = $2 AND ra.status IN ('reserved','active')
       RETURNING ra.*, cr.room_code`,
      [doctorId, date],
    );
    if (!rows.length) return null;

    const r = rows[0] as Record<string, unknown>;
    return {
      assignment: rowToAssignment(r),
      roomCode: r.room_code as string ?? '',
    };
  });
}

export async function releaseRoomByCode(
  roomCode: string,
  branchId: number,
): Promise<{ assignment: RoomAssignmentRow; doctorId: string; assignedDate: string } | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE room_assignments ra
       SET status = 'released', released_at = NOW(), updated_at = NOW()
       FROM clinic_rooms cr
       WHERE ra.room_id = cr.id
         AND cr.room_code = $1 AND cr.branch_id = $2
         AND ra.status IN ('reserved','active')
       RETURNING ra.*, ra.doctor_id AS did, ra.assigned_date AS adate`,
      [roomCode, branchId],
    );
    if (!rows.length) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      assignment: rowToAssignment(r),
      doctorId: r.doctor_id as string,
      assignedDate: (r.assigned_date as Date).toISOString().split('T')[0],
    };
  });
}

export async function updateRoomSettings(
  roomCode: string,
  updates: { roomName?: string; floor?: number | null; description?: string | null; isActive?: boolean },
  branchId: number,
): Promise<RoomRow> {
  return withTransaction(async (client) => {
    const sets: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [];
    let i = 1;
    if (updates.roomName !== undefined) { sets.push(`name_en = $${i++}`); vals.push(updates.roomName); }
    if (updates.floor !== undefined) { sets.push(`floor = $${i++}`); vals.push(updates.floor); }
    if (updates.description !== undefined) { sets.push(`description = $${i++}`); vals.push(updates.description); }
    if (updates.isActive !== undefined) { sets.push(`is_active = $${i++}`); vals.push(updates.isActive); }

    vals.push(roomCode, branchId);
    const { rows } = await client.query(
      `UPDATE clinic_rooms SET ${sets.join(', ')} WHERE room_code = $${i++} AND branch_id = $${i} RETURNING *`,
      vals,
    );
    if (!rows.length) throw Object.assign(new Error('Room not found'), { statusCode: 404, code: 'ROOM_NOT_FOUND' });
    return rowToRoomRow(rows[0] as Record<string, unknown>);
  });
}

export async function nextPatient(
  appointmentId: string,
  performedBy: string,
  branchId: number,
): Promise<NextPatientResult> {
  return withTransaction(async (client) => {
    // 1. Lock and fetch the appointment being completed
    const { rows: apptRows } = await client.query(
      `SELECT a.id, a.patient_id, a.doctor_id, a.patient_source, a.approved_charge,
              a.specialty_id, a.status, a.appointment_type,
              d.consultation_split_doctor, d.consultation_split_clinic
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE a.id = $1 AND a.deleted_at IS NULL FOR UPDATE`,
      [appointmentId],
    );
    if (!apptRows.length) {
      throw Object.assign(new Error('Appointment not found'), { statusCode: 404, code: 'APPOINTMENT_NOT_FOUND' });
    }
    const appt = apptRows[0] as Record<string, unknown>;

    // 2. Mark appointment as Completed
    await client.query(
      `UPDATE appointments
       SET status = 'Comp.', version = version + 1, updated_at = NOW(), updated_by = $2
       WHERE id = $1`,
      [appointmentId, performedBy],
    );

    // 3. Complete the queue entry — allow in_session or called/waiting states
    const { rows: qRows } = await client.query(
      `UPDATE patient_queue
       SET status = 'completed', session_end = NOW(), updated_at = NOW()
       WHERE appointment_id = $1 AND status IN ('in_session','called','waiting')
       RETURNING id, session_start, doctor_id, queue_date`,
      [appointmentId],
    );
    const qEntry = qRows.length ? (qRows[0] as Record<string, unknown>) : null;

    const sessionStart = qEntry?.session_start ? (qEntry.session_start as Date).toISOString() : null;
    const durationMins = sessionStart
      ? Math.round((Date.now() - new Date(sessionStart).getTime()) / 60_000)
      : 0;

    // 4. Find next waiting patient for this doctor
    const doctorId = appt.doctor_id as string;
    const queueDate = qEntry?.queue_date
      ? (qEntry.queue_date as Date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { rows: nextRows } = await client.query(
      `SELECT id, appointment_id, patient_id, position
       FROM patient_queue
       WHERE doctor_id = $1 AND queue_date = $2 AND status = 'waiting'
       ORDER BY position ASC LIMIT 1 FOR UPDATE`,
      [doctorId, queueDate],
    );

    let next: NextPatientResult['next'] = null;
    if (nextRows.length) {
      const nr = nextRows[0] as Record<string, unknown>;
      await client.query(
        `UPDATE patient_queue SET status = 'called', called_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [nr.id],
      );
      next = {
        queueId: nr.id as string,
        appointmentId: nr.appointment_id as string,
        patientId: nr.patient_id as string,
        position: nr.position as number,
      };
    }

    return {
      completed: {
        appointmentId,
        patientId: appt.patient_id as string,
        doctorId,
        patientSource: appt.patient_source as string,
        approvedCharge: Number(appt.approved_charge ?? 0),
        splitDoctorPercentage: Number(appt.consultation_split_doctor ?? 50),
        splitClinicPercentage: Number(appt.consultation_split_clinic ?? 50),
        specialtyId: appt.specialty_id as number | null,
        durationMins,
        sessionStart,
        appointmentType: (appt.appointment_type as string | null) ?? null,
      },
      next,
    };
  });
}

export async function getRoomStats(branchId: number): Promise<{ roomCode: string; appointmentsToday: number; avgOccupancyThisMonth: number; topDoctorId?: string }[]> {
  return withRlsContext(async (client) => {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';

    const { rows } = await client.query(
      `SELECT
         cr.room_code,
         COUNT(al.id) FILTER (WHERE al.assigned_date = $1)                     AS appointments_today,
         ROUND(COUNT(al.id) FILTER (WHERE al.assigned_date >= $2)::NUMERIC
               / GREATEST(1, CURRENT_DATE - $2::DATE + 1), 2)                  AS avg_occupancy,
         (SELECT ra2.doctor_id FROM room_assignments ra2
          WHERE ra2.room_id = cr.id AND ra2.status != 'cancelled'
          GROUP BY ra2.doctor_id ORDER BY COUNT(*) DESC LIMIT 1)               AS top_doctor_id
       FROM clinic_rooms cr
       LEFT JOIN room_appointment_log al ON al.room_id = cr.id
       WHERE cr.branch_id = $3 AND cr.room_code IS NOT NULL
       GROUP BY cr.id, cr.room_code
       ORDER BY cr.room_code`,
      [today, firstOfMonth, branchId],
    );

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        roomCode: row.room_code as string,
        appointmentsToday: Number(row.appointments_today ?? 0),
        avgOccupancyThisMonth: Number(row.avg_occupancy ?? 0),
        topDoctorId: row.top_doctor_id as string | undefined,
      };
    });
  });
}
