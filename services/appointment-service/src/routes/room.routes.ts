import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/room.controller';

// Response schema for a RoomDetail (§4.6 contract). Must list EVERY field the
// repository returns — fastify serializes responses per schema and silently
// drops anything missing here. Keep in sync with room.repository RoomDetail
// (mirrored by @fadl/types RoomDetail).
const roomDetailSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    code: { type: 'string' },
    roomCode: { type: 'string', nullable: true },
    nameEn: { type: 'string' },
    nameAr: { type: 'string', nullable: true },
    roomType: { type: 'string' },
    floor: { type: 'integer', nullable: true },
    description: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    branchId: { type: 'integer' },
    status: { type: 'string', enum: ['available', 'reserved', 'occupied', 'inactive'] },
    assignedDoctor: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        nameEn: { type: 'string', nullable: true },
        nameAr: { type: 'string', nullable: true },
        specialtyNameEn: { type: 'string', nullable: true },
        assignedFrom: { type: 'string', nullable: true },
        assignedUntil: { type: 'string', nullable: true },
      },
      required: ['id', 'nameEn', 'nameAr', 'specialtyNameEn', 'assignedFrom', 'assignedUntil'],
    },
    assignmentId: { type: 'string', nullable: true },
    appointmentsToday: { type: 'integer' },
    appointmentsRemaining: { type: 'integer' },
  },
  required: ['id', 'code', 'roomCode', 'nameEn', 'nameAr', 'roomType', 'floor', 'description', 'isActive', 'branchId', 'status', 'assignedDoctor', 'assignmentId', 'appointmentsToday', 'appointmentsRemaining'],
} as const;

const roomStatsItemSchema = {
  type: 'object',
  properties: {
    roomCode: { type: 'string' },
    appointmentsToday: { type: 'integer' },
    avgOccupancyThisMonth: { type: 'number' },
    topDoctorId: { type: 'string', nullable: true },
  },
  required: ['roomCode', 'appointmentsToday', 'avgOccupancyThisMonth'],
} as const;

const listEnvelope = (items: object) => ({
  200: {
    type: 'object',
    properties: { success: { type: 'boolean' }, data: { type: 'array', items } },
    required: ['success', 'data'],
  },
});

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  // SSE — no body schema, no auth middleware (handled in controller via request.user)
  app.addHook('onRequest', requireAuth);

  // GET /rooms/stream — real-time SSE
  app.get('/rooms/stream', { schema: { tags: ['rooms'] } }, ctrl.roomStream);

  // GET /rooms — list with live status
  app.get('/rooms', {
    schema: {
      tags: ['rooms'],
      querystring: { type: 'object', properties: { date: { type: 'string', format: 'date' } } },
      response: listEnvelope(roomDetailSchema),
    },
  }, ctrl.listRooms);

  // GET /rooms/availability — simplified availability map
  app.get('/rooms/availability', {
    schema: {
      tags: ['rooms'],
      querystring: { type: 'object', properties: { date: { type: 'string', format: 'date' } } },
      response: listEnvelope({
        type: 'object',
        properties: {
          roomCode: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['available', 'reserved', 'occupied', 'inactive'] },
        },
        required: ['roomCode', 'status'],
      }),
    },
  }, ctrl.getRoomAvailability);

  // GET /rooms/assignments — all assignments for a date (waiting screen)
  app.get('/rooms/assignments', {
    schema: {
      tags: ['rooms'],
      querystring: { type: 'object', properties: { date: { type: 'string', format: 'date' } } },
      response: listEnvelope({
        type: 'object',
        properties: {
          id: { type: 'string' },
          roomId: { type: 'integer' },
          roomCode: { type: 'string', nullable: true },
          doctorId: { type: 'string' },
          assignedDate: { type: 'string' },
          assignedFrom: { type: 'string' },
          assignedUntil: { type: 'string' },
          assignedBy: { type: 'string', nullable: true },
          assignedAt: { type: 'string' },
          status: { type: 'string', enum: ['reserved', 'active', 'released', 'cancelled'] },
          releasedAt: { type: 'string', nullable: true },
          branchId: { type: 'integer' },
        },
        required: ['id', 'roomId', 'roomCode', 'doctorId', 'assignedDate', 'assignedFrom', 'assignedUntil', 'status', 'branchId'],
      }),
    },
  }, ctrl.listRoomAssignments);

  // GET /rooms/stats — usage stats per room
  app.get('/rooms/stats', {
    schema: { tags: ['rooms'], response: listEnvelope(roomStatsItemSchema) },
  }, ctrl.getRoomStats);

  // POST /rooms/:roomCode/assign — manual assignment (admin/receptionist)
  app.post('/rooms/:roomCode/assign', {
    schema: {
      tags: ['rooms'],
      params: { type: 'object', properties: { roomCode: { type: 'string' } }, required: ['roomCode'] },
      body: {
        type: 'object',
        required: ['doctorId', 'date', 'fromTime', 'untilTime'],
        properties: {
          doctorId:  { type: 'string', format: 'uuid' },
          date:      { type: 'string', format: 'date' },
          fromTime:  { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          untilTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
        },
      },
    },
    preHandler: [requireRole('admin', 'receptionist')],
  }, ctrl.assignRoom);

  // POST /rooms/auto-assign — system auto-assign (admin)
  app.post('/rooms/auto-assign', {
    schema: {
      tags: ['rooms'],
      body: {
        type: 'object',
        required: ['doctorId', 'date', 'fromTime', 'untilTime'],
        properties: {
          doctorId:  { type: 'string', format: 'uuid' },
          date:      { type: 'string', format: 'date' },
          fromTime:  { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          untilTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
        },
      },
    },
    preHandler: [requireRole('admin')],
  }, ctrl.autoAssignRoom);

  // DELETE /rooms/:roomCode/assignment — release a room
  app.delete('/rooms/:roomCode/assignment', {
    schema: {
      tags: ['rooms'],
      params: { type: 'object', properties: { roomCode: { type: 'string' } }, required: ['roomCode'] },
      querystring: { type: 'object', properties: { date: { type: 'string', format: 'date' } } },
    },
    preHandler: [requireRole('admin', 'receptionist')],
  }, ctrl.releaseRoom);

  // POST /rooms/:roomCode/next-patient — complete current session and call next
  app.post('/rooms/:roomCode/next-patient', {
    schema: {
      tags: ['rooms'],
      params: { type: 'object', properties: { roomCode: { type: 'string' } }, required: ['roomCode'] },
      body: {
        type: 'object',
        required: ['appointmentId'],
        properties: {
          appointmentId: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [requireRole('admin', 'receptionist', 'doctor')],
  }, ctrl.nextPatientHandler);

  // PATCH /rooms/:roomCode/settings — update room metadata (admin)
  app.patch('/rooms/:roomCode/settings', {
    schema: {
      tags: ['rooms'],
      params: { type: 'object', properties: { roomCode: { type: 'string' } }, required: ['roomCode'] },
      body: {
        type: 'object',
        properties: {
          roomName:    { type: 'string', minLength: 1, maxLength: 100 },
          floor:       { type: 'integer', nullable: true },
          description: { type: 'string', maxLength: 500, nullable: true },
          isActive:    { type: 'boolean' },
        },
      },
    },
    preHandler: [requireRole('admin')],
  }, ctrl.updateRoom);
}
