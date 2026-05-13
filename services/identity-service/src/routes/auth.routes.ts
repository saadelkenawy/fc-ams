import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/auth.controller';

export async function authRoutes(app: FastifyInstance): Promise<void> {

  // POST /auth/login
  app.post('/auth/login', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
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
          role:     { type: 'string', enum: ['admin', 'finance', 'doctor', 'receptionist', 'patient', 'procurement'] },
          branchId: { type: 'integer', minimum: 1, default: 1 },
          doctorId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, ctrl.createUser);

  // PATCH /users/:id  (update role / name / isActive)
  app.patch('/users/:id', {
    preHandler: [requireAuth, requireRole('admin')],
    schema: {
      tags: ['users'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          role:     { type: 'string', enum: ['admin', 'finance', 'doctor', 'receptionist', 'patient', 'procurement'] },
          isActive: { type: 'boolean' },
          nameEn:   { type: 'string' },
          nameAr:   { type: 'string' },
        },
      },
    },
  }, ctrl.updateUser);

  // PATCH /users/:id/reset-password  (admin sets new password for another user)
  app.patch('/users/:id/reset-password', {
    preHandler: [requireAuth, requireRole('admin')],
    schema: {
      tags: ['users'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['newPassword'],
        properties: { newPassword: { type: 'string', minLength: 8 } },
      },
    },
  }, ctrl.adminResetPassword);

  // DELETE /users/:id  (admin only)
  app.delete('/users/:id', {
    preHandler: [requireAuth, requireRole('admin')],
    schema: {
      tags: ['users'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, ctrl.deleteUser);

  // POST /auth/verify-password  (current user verifies their own password — used for sensitive actions)
  app.post('/auth/verify-password', {
    preHandler: [requireAuth],
    schema: {
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['password'],
        properties: { password: { type: 'string', minLength: 1 } },
      },
    },
  }, ctrl.verifyPasswordEndpoint);
}
