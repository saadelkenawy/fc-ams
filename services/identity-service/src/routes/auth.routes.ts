import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/auth.controller';

export async function authRoutes(app: FastifyInstance): Promise<void> {

  // POST /auth/login
  app.post('/auth/login', {
    schema: {
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, ctrl.login);

  // POST /auth/refresh
  app.post('/auth/refresh', {
    schema: {
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  }, ctrl.refresh);

  // POST /auth/logout  (requires valid access token)
  app.post('/auth/logout', {
    preHandler: [requireAuth],
    schema: {
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  }, ctrl.logout);

  // GET /auth/me
  app.get('/auth/me', {
    preHandler: [requireAuth],
    schema: { tags: ['auth'] },
  }, ctrl.me);

  // PATCH /auth/password
  app.patch('/auth/password', {
    preHandler: [requireAuth],
    schema: {
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword:     { type: 'string', minLength: 8 },
        },
      },
    },
  }, ctrl.changePassword);

  // ── User management (admin only) ──────────────────────────────────────────

  // GET /users
  app.get('/users', {
    preHandler: [requireAuth, requireRole('admin')],
    schema: { tags: ['users'] },
  }, ctrl.listUsers);

  // POST /users
  app.post('/users', {
    preHandler: [requireAuth, requireRole('admin')],
    schema: {
      tags: ['users'],
      body: {
        type: 'object',
        required: ['email', 'password', 'nameEn', 'role'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          nameEn:   { type: 'string' },
          nameAr:   { type: 'string' },
          role:     { type: 'string', enum: ['admin', 'finance', 'doctor', 'receptionist', 'patient'] },
          branchId: { type: 'integer', minimum: 1, default: 1 },
          doctorId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, ctrl.createUser);
}
