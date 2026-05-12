import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/room.controller';

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
    },
  }, ctrl.listRooms);

  // GET /rooms/availability — simplified availability map
  app.get('/rooms/availability', {
    schema: {
      tags: ['rooms'],
      querystring: { type: 'object', properties: { date: { type: 'string', format: 'date' } } },
    },
  }, ctrl.getRoomAvailability);

  // GET /rooms/stats — usage stats per room
  app.get('/rooms/stats', { schema: { tags: ['rooms'] } }, ctrl.getRoomStats);

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
