import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  app.get('/appointments/:id', {
    schema: {
      tags: ['appointments'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    void reply.status(501).send({ success: false, error: { code: 'NOT_IMPLEMENTED', message: `GET /appointments/${id} not yet implemented` } });
  });

  app.get('/appointments', {
    schema: {
      tags: ['appointments'],
      querystring: {
        type: 'object',
        properties: {
          doctorId:  { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          date:      { type: 'string', format: 'date' },
          status:    { type: 'string', enum: ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.'] },
          page:      { type: 'integer', minimum: 1, default: 1 },
          limit:     { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (_request, reply) => {
    void reply.status(501).send({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'GET /appointments not yet implemented' } });
  });

  app.post('/appointments', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: { tags: ['appointments'] },
  }, async (_request, reply) => {
    void reply.status(501).send({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'POST /appointments not yet implemented' } });
  });

  app.patch('/appointments/:id/status', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: {
      tags: ['appointments'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.'] },
        },
        required: ['status'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    void reply.status(501).send({ success: false, error: { code: 'NOT_IMPLEMENTED', message: `PATCH /appointments/${id}/status not yet implemented` } });
  });

  app.delete('/appointments/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['appointments'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    void reply.status(501).send({ success: false, error: { code: 'NOT_IMPLEMENTED', message: `DELETE /appointments/${id} not yet implemented` } });
  });
}
