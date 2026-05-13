import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/billing.controller';

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

const STATUS_ENUM = ['pending', 'verified', 'approved', 'paid', 'reconciled', 'refunded'];

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // GET /transactions
  app.get('/transactions', {
    preHandler: [requireRole('admin', 'finance', 'doctor', 'receptionist')],
    schema: {
      tags: ['billing'],
      querystring: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', format: 'uuid' },
          patientId:     { type: 'string', format: 'uuid' },
          doctorId:      { type: 'string', format: 'uuid' },
          status:        { type: 'string', enum: STATUS_ENUM },
          dateFrom:      { type: 'string', format: 'date' },
          dateTo:        { type: 'string', format: 'date' },
          page:          { type: 'integer', minimum: 1, default: 1 },
          limit:         { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listTransactions);

  // GET /transactions/:id
  app.get('/transactions/:id', {
    preHandler: [requireRole('admin', 'finance', 'doctor', 'receptionist')],
    schema: { tags: ['billing'], params: idParam },
  }, ctrl.getTransaction);

  // POST /transactions
  app.post('/transactions', {
    preHandler: [requireRole('admin', 'finance', 'receptionist')],
    schema: {
      tags: ['billing'],
      body: {
        type: 'object',
        required: ['idempotencyKey', 'patientId', 'patientSource', 'approvedCharge', 'splitDoctorPercentage', 'splitClinicPercentage'],
        properties: {
          idempotencyKey:        { type: 'string', maxLength: 100 },
          appointmentId:         { type: 'string', format: 'uuid' },
          patientId:             { type: 'string', format: 'uuid' },
          doctorId:              { type: 'string', format: 'uuid' },
          procedureId:           { type: 'string', format: 'uuid' },
          patientSource:         { type: 'string' },
          doctorSpecialtyId:     { type: 'integer' },
          approvedCharge:        { type: 'number', exclusiveMinimum: 0 },
          procedureCost:         { type: 'number', exclusiveMinimum: 0 },
          splitDoctorPercentage: { type: 'number', minimum: 0, maximum: 100 },
          splitClinicPercentage: { type: 'number', minimum: 0, maximum: 100 },
          paymentMethod:         { type: 'string' },
          currencyCode:          { type: 'string', enum: ['EGP', 'USD', 'EUR', 'SAR', 'AED'], default: 'EGP' },
        },
      },
    },
  }, ctrl.createTransaction);

  // GET /transactions/:id/extra-services
  app.get('/transactions/:id/extra-services', {
    preHandler: [requireRole('admin', 'finance', 'doctor', 'receptionist')],
    schema: { tags: ['billing'], params: idParam },
  }, ctrl.getExtraServices);

  // PUT /transactions/:id/extra-services  (replaces all line items atomically)
  app.put('/transactions/:id/extra-services', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      params: idParam,
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['serviceName', 'cost'],
              properties: {
                serviceName: { type: 'string', minLength: 1, maxLength: 200 },
                cost: { type: 'number', minimum: 0 },
              },
            },
          },
        },
      },
    },
  }, ctrl.replaceExtraServices);

  // PATCH /transactions/:id/procedure-cost  (admin/finance only — corrects extra service amount)
  app.patch('/transactions/:id/procedure-cost', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      params: idParam,
      body: {
        type: 'object',
        required: ['procedureCost'],
        properties: {
          procedureCost: { type: ['number', 'null'], minimum: 0 },
        },
      },
    },
  }, ctrl.updateProcedureCost);

  // PATCH /transactions/:id/status
  app.patch('/transactions/:id/status', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      params: idParam,
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status:              { type: 'string', enum: STATUS_ENUM },
          settlementReference: { type: 'string' },
          checkInAmount:       { type: 'number', exclusiveMinimum: 0 },
          checkOutAmount:      { type: 'number', exclusiveMinimum: 0 },
        },
      },
    },
  }, ctrl.updateStatus);

  // GET /settlements (list all doctors)
  app.get('/settlements', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from:  { type: 'string', format: 'date' },
          to:    { type: 'string', format: 'date' },
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listSettlements);

  // ── Source Fee Rules ────────────────────────────────────────────────────────
  app.get('/sources', {
    preHandler: [requireRole('admin', 'finance', 'receptionist')],
    schema: { tags: ['billing'] },
  }, ctrl.listSourcesHandler);

  app.post('/sources', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      body: {
        type: 'object',
        required: ['sourceCode', 'sourceNameEn', 'sourceNameAr', 'feeType', 'feeValue', 'validFrom'],
        properties: {
          sourceCode:   { type: 'string', maxLength: 50 },
          sourceNameEn: { type: 'string', maxLength: 100 },
          sourceNameAr: { type: 'string', maxLength: 100 },
          feeType:      { type: 'string', enum: ['percentage', 'fixed'] },
          feeValue:     { type: 'number', minimum: 0 },
          deductFrom:   { type: 'string', enum: ['clinic', 'doctor', 'both'] },
          isActive:     { type: 'boolean' },
          validFrom:    { type: 'string', format: 'date' },
          validUntil:   { type: 'string', format: 'date' },
        },
      },
    },
  }, ctrl.createSourceHandler);

  app.patch('/sources/:code', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
    },
  }, ctrl.updateSourceHandler);

  app.delete('/sources/:code', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
    },
  }, ctrl.deleteSourceHandler);

  // PATCH /transactions/by-appointment/:appointmentId/refund  (marks as refunded when appointment is deleted)
  app.patch('/transactions/by-appointment/:appointmentId/refund', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: {
        type: 'object',
        required: ['appointmentId'],
        properties: { appointmentId: { type: 'string', format: 'uuid' } },
      },
    },
  }, ctrl.refundTransactionByAppointmentHandler);

  // GET /sources/:code/rate?specialtyId=
  app.get('/sources/:code/rate', {
    preHandler: [requireRole('admin', 'finance', 'receptionist')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      querystring: { type: 'object', properties: { specialtyId: { type: 'integer' } } },
    },
  }, ctrl.getSourceRateHandler);

  // GET /settlements/doctor (single doctor settlement detail)
  app.get('/settlements/doctor', {
    preHandler: [requireRole('admin', 'finance', 'doctor')],
    schema: {
      tags: ['billing'],
      querystring: {
        type: 'object',
        required: ['doctorId', 'from', 'to'],
        properties: {
          doctorId: { type: 'string', format: 'uuid' },
          from:     { type: 'string', format: 'date' },
          to:       { type: 'string', format: 'date' },
        },
      },
    },
  }, ctrl.getDoctorSettlement);
}
