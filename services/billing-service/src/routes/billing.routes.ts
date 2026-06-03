import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/billing.controller';

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

const STATUS_ENUM = ['pending', 'verified', 'approved', 'paid', 'reconciled', 'refunded'];

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

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
          limit:         { type: 'integer', minimum: 1, maximum: 500, default: 20 },
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
          from:          { type: 'string', format: 'date' },
          to:            { type: 'string', format: 'date' },
          page:          { type: 'integer', minimum: 1, default: 1 },
          limit:         { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          unsettledOnly: { type: 'boolean' },
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

  // GET /transactions/by-appointment/:appointmentId/extra-services
  app.get('/transactions/by-appointment/:appointmentId/extra-services', {
    preHandler: [requireRole('admin', 'finance', 'doctor', 'receptionist')],
    schema: {
      tags: ['billing'],
      params: {
        type: 'object',
        required: ['appointmentId'],
        properties: { appointmentId: { type: 'string', format: 'uuid' } },
      },
    },
  }, ctrl.getExtraServicesByAppointmentHandler);

  // PUT /transactions/by-appointment/:appointmentId/extra-services  (replaces all line items atomically)
  app.put('/transactions/by-appointment/:appointmentId/extra-services', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      params: {
        type: 'object',
        required: ['appointmentId'],
        properties: { appointmentId: { type: 'string', format: 'uuid' } },
      },
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
  }, ctrl.replaceExtraServicesByAppointmentHandler);

  // PATCH /transactions/by-appointment/:appointmentId/payment-status  (sync billing status from appointment)
  app.patch('/transactions/by-appointment/:appointmentId/payment-status', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: {
        type: 'object',
        required: ['appointmentId'],
        properties: { appointmentId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: STATUS_ENUM } },
      },
    },
  }, ctrl.updatePaymentStatusByAppointmentHandler);

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

  // PATCH /transactions/by-appointment/:appointmentId/charge  (recalculates all derived fields when fee changes)
  app.patch('/transactions/by-appointment/:appointmentId/charge', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: {
        type: 'object',
        required: ['appointmentId'],
        properties: { appointmentId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['approvedCharge'],
        properties: { approvedCharge: { type: 'number', exclusiveMinimum: 0 } },
      },
    },
  }, ctrl.updateChargeByAppointmentHandler);

  // GET /sources/:code/rate?specialtyId=
  app.get('/sources/:code/rate', {
    preHandler: [requireRole('admin', 'finance', 'receptionist')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      querystring: { type: 'object', properties: { specialtyId: { type: 'integer' } } },
    },
  }, ctrl.getSourceRateHandler);

  // POST /transactions/bulk-delete  (admin only)
  app.post('/transactions/bulk-delete', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      body: {
        type: 'object',
        required: ['ids', 'reason', 'password'],
        properties: {
          ids:      { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
          reason:   { type: 'string', minLength: 20 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, ctrl.bulkDeleteHandler);

  // PATCH /transactions/bulk/payment-method  (admin only)
  app.patch('/transactions/bulk/payment-method', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      body: {
        type: 'object',
        required: ['ids', 'paymentMethod', 'reason', 'password'],
        properties: {
          ids:           { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
          paymentMethod: { type: 'string', minLength: 1 },
          reason:        { type: 'string', minLength: 10 },
          password:      { type: 'string', minLength: 1 },
        },
      },
    },
  }, ctrl.bulkEditPaymentMethodHandler);

  // POST /settlements/reconcile  (atomically reconcile all Paid txs for a doctor)
  app.post('/settlements/reconcile', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      body: {
        type: 'object',
        required: ['doctorId', 'from', 'to'],
        properties: {
          doctorId:         { type: 'string', format: 'uuid' },
          from:             { type: 'string', format: 'date' },
          to:               { type: 'string', format: 'date' },
          paymentMethod:    { type: 'string', enum: ['cash', 'bank', 'cheque', 'transfer'] },
          paymentReference: { type: 'string', maxLength: 200 },
          notes:            { type: 'string', maxLength: 1000 },
        },
      },
    },
  }, ctrl.reconcileDoctorHandler);

  // GET /settlements/records  (list completed settlement records)
  app.get('/settlements/records', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      querystring: {
        type: 'object',
        properties: {
          doctorId: { type: 'string', format: 'uuid' },
          from:     { type: 'string', format: 'date' },
          to:       { type: 'string', format: 'date' },
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listSettlementRecordsHandler);

  // POST /settlements/records/:id/reverse
  app.post('/settlements/records/:id/reverse', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string', minLength: 10 } },
      },
    },
  }, ctrl.reverseSettlementHandler);

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

  // ── Doctor Compensation ──────────────────────────────────────────────────────

  // GET /compensation/:doctorId
  app.get('/compensation/:doctorId', {
    preHandler: [requireRole('admin', 'finance')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { doctorId: { type: 'string', format: 'uuid' } }, required: ['doctorId'] },
    },
  }, ctrl.listDoctorCompensationHandler);

  // POST /compensation/:doctorId  (set/update a rate for a visit type)
  app.post('/compensation/:doctorId', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { doctorId: { type: 'string', format: 'uuid' } }, required: ['doctorId'] },
      body: {
        type: 'object',
        required: ['visitType', 'doctorPercentage', 'clinicPercentage', 'effectiveFrom'],
        properties: {
          visitType:        { type: 'string', enum: ['consultation', 'operative', 'online'] },
          doctorPercentage: { type: 'number', minimum: 0, maximum: 100 },
          clinicPercentage: { type: 'number', minimum: 0, maximum: 100 },
          effectiveFrom:    { type: 'string', format: 'date' },
          applyToExisting:  { type: 'boolean', default: false },
        },
      },
    },
  }, ctrl.setDoctorCompensationHandler);

  // DELETE /compensation/rules/:id
  app.delete('/compensation/rules/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['billing'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.deleteCompensationRuleHandler);
}
