import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { appointmentClient, patientClient } from '../clients/internal';
import * as repo from '../repositories/event.repository';

// ── Signature verification ────────────────────────────────────────────────

function verifySecret(header: string | undefined, expected: string): boolean {
  if (!expected) return true; // dev mode: skip verification
  return header === expected;
}

// ── Normalised appointment shape ──────────────────────────────────────────

interface NormalisedAppointment {
  patientMobile: string;
  patientName:   string;
  doctorId:      string;
  date:          string;
  startTime:     string;
  endTime:       string;
  patientSource: string;
  platform:      string;
  externalId:    string;
}

// ── Platform adapters ─────────────────────────────────────────────────────

function normaliseVizita(payload: Record<string, unknown>): NormalisedAppointment | null {
  try {
    // Vizita payload: { booking_id, patient_phone, patient_name, doctor_external_id, date, time_from, time_to }
    return {
      patientMobile: String(payload.patient_phone ?? ''),
      patientName:   String(payload.patient_name ?? ''),
      doctorId:      String(payload.doctor_external_id ?? ''),
      date:          String(payload.date ?? '').slice(0, 10),
      startTime:     String(payload.time_from ?? '09:00').slice(0, 5),
      endTime:       String(payload.time_to   ?? '09:30').slice(0, 5),
      patientSource: config.VIZITA_SOURCE_CODE,
      platform:      'vizita',
      externalId:    String(payload.booking_id ?? ''),
    };
  } catch { return null; }
}

function normaliseEkshf(payload: Record<string, unknown>): NormalisedAppointment | null {
  try {
    // Ekshf payload: { id, mobile, name, doctor_id, appointment_date, start_time, end_time }
    return {
      patientMobile: String(payload.mobile ?? ''),
      patientName:   String(payload.name ?? ''),
      doctorId:      String(payload.doctor_id ?? ''),
      date:          String(payload.appointment_date ?? '').slice(0, 10),
      startTime:     String(payload.start_time ?? '09:00').slice(0, 5),
      endTime:       String(payload.end_time   ?? '09:30').slice(0, 5),
      patientSource: config.EKSHF_SOURCE_CODE,
      platform:      'ekshf',
      externalId:    String(payload.id ?? ''),
    };
  } catch { return null; }
}

function normaliseCliniDo(payload: Record<string, unknown>): NormalisedAppointment | null {
  try {
    // CliniDo payload: { appointment_id, patient_mobile, patient_full_name, doctor_uuid, slot_date, slot_start, slot_end }
    return {
      patientMobile: String(payload.patient_mobile ?? ''),
      patientName:   String(payload.patient_full_name ?? ''),
      doctorId:      String(payload.doctor_uuid ?? ''),
      date:          String(payload.slot_date ?? '').slice(0, 10),
      startTime:     String(payload.slot_start ?? '09:00').slice(0, 5),
      endTime:       String(payload.slot_end   ?? '09:30').slice(0, 5),
      patientSource: config.CLINIDO_SOURCE_CODE,
      platform:      'clinido',
      externalId:    String(payload.appointment_id ?? ''),
    };
  } catch { return null; }
}

// ── Lookup or create patient ──────────────────────────────────────────────

async function resolvePatientId(mobile: string, name: string): Promise<string | null> {
  try {
    const res = await patientClient.get<{ data: Array<{ id: string }> }>('/patients', { params: { mobile, limit: 1 } });
    const patients = res.data?.data ?? [];
    if (patients.length) return patients[0].id;

    const nameParts = name.split(' ');
    const created = await patientClient.post<{ data: { id: string } }>('/patients', {
      firstNameEn: nameParts[0] ?? 'Unknown',
      lastNameEn:  nameParts.slice(1).join(' ') || 'Unknown',
      firstNameAr: nameParts[0] ?? 'غير معروف',
      lastNameAr:  nameParts.slice(1).join(' ') || 'غير معروف',
      mobile,
      sourceFirstVisit: 'platform',
    });
    return created.data?.data?.id ?? null;
  } catch {
    return null;
  }
}

// ── Generic webhook processor ─────────────────────────────────────────────

async function processAppointmentWebhook(
  req: FastifyRequest,
  reply: FastifyReply,
  platform: 'vizita' | 'ekshf' | 'clinido',
  secret: string,
  normalise: (p: Record<string, unknown>) => NormalisedAppointment | null,
): Promise<void> {
  const headerSecret = (req.headers['x-webhook-secret'] ?? req.headers['x-hub-signature']) as string | undefined;

  if (!verifySecret(headerSecret, secret)) {
    void reply.status(401).send({ success: false, error: { code: 'INVALID_SECRET', message: 'Invalid webhook secret' } });
    return;
  }

  const payload = req.body as Record<string, unknown>;
  const externalId = String(payload.booking_id ?? payload.id ?? payload.appointment_id ?? Date.now());

  const event = await repo.createEvent({
    platform, eventType: 'appointment.booked',
    idempotencyKey: `${platform}-appt-${externalId}`,
    payload, branchId: config.BRANCH_ID,
  });

  if (event.status === 'duplicate') {
    void reply.send({ success: true, data: { status: 'duplicate', eventId: event.id } });
    return;
  }

  const norm = normalise(payload);

  if (!norm || !norm.date || !norm.doctorId) {
    await repo.updateEvent(event.id, { status: 'failed', errorMessage: 'Could not normalise payload' });
    void reply.status(422).send({ success: false, error: { code: 'NORMALISE_FAILED', message: 'Unrecognised payload shape' } });
    return;
  }

  const patientId = await resolvePatientId(norm.patientMobile, norm.patientName);

  if (!patientId) {
    await repo.updateEvent(event.id, { status: 'failed', normalized: norm as unknown as Record<string, unknown>, errorMessage: 'Could not create/find patient' });
    void reply.status(422).send({ success: false, error: { code: 'PATIENT_RESOLVE_FAILED', message: 'Patient lookup failed' } });
    return;
  }

  let apptResult: Record<string, unknown> = {};
  let finalStatus: 'processed' | 'failed' = 'processed';
  let errorMsg: string | undefined;

  try {
    const res = await appointmentClient.post<{ data: Record<string, unknown> }>('/appointments', {
      patientId,
      doctorId:        norm.doctorId,
      appointmentDate: norm.date,
      startTime:       norm.startTime,
      endTime:         norm.endTime,
      patientSource:   norm.patientSource,
      appointmentType: 'in_person',
      idempotencyKey:  `${platform}-${externalId}`,
    });
    apptResult = res.data?.data ?? {};
  } catch (err: unknown) {
    finalStatus = 'failed';
    errorMsg = (err as { message?: string }).message ?? 'Appointment creation failed';
  }

  await repo.updateEvent(event.id, {
    status:     finalStatus,
    normalized: norm as unknown as Record<string, unknown>,
    result:     apptResult,
    errorMessage: errorMsg,
  });

  if (finalStatus === 'failed') {
    void reply.status(422).send({ success: false, error: { code: 'APPOINTMENT_FAILED', message: errorMsg } });
    return;
  }

  void reply.status(200).send({ success: true, data: { eventId: event.id, appointment: apptResult } });
}

// ── Public handlers ───────────────────────────────────────────────────────

export async function vizitaWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await processAppointmentWebhook(req, reply, 'vizita', config.VIZITA_WEBHOOK_SECRET, normaliseVizita);
}

export async function ekshfWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await processAppointmentWebhook(req, reply, 'ekshf', config.EKSHF_WEBHOOK_SECRET, normaliseEkshf);
}

export async function clinidoWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await processAppointmentWebhook(req, reply, 'clinido', config.CLINIDO_WEBHOOK_SECRET, normaliseCliniDo);
}

// ── InstaPay payment callback ─────────────────────────────────────────────

const instaPaySchema = z.object({
  transaction_id:  z.string(),
  amount:          z.number().positive(),
  currency:        z.string().default('EGP'),
  status:          z.enum(['success', 'failed', 'pending']),
  reference_id:    z.string().optional(), // our appointment/transaction ID
  payer_mobile:    z.string().optional(),
  timestamp:       z.string().optional(),
});

export async function instaPayWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const headerSecret = req.headers['x-instapay-secret'] as string | undefined;
  if (!verifySecret(headerSecret, config.INSTAPAY_WEBHOOK_SECRET)) {
    void reply.status(401).send({ success: false, error: { code: 'INVALID_SECRET', message: 'Invalid secret' } });
    return;
  }

  const payload = req.body as Record<string, unknown>;
  const parsed = instaPaySchema.safeParse(payload);

  const event = await repo.createEvent({
    platform: 'instapay', eventType: `payment.${String(payload.status ?? 'unknown')}`,
    idempotencyKey: `instapay-${String(payload.transaction_id ?? Date.now())}`,
    payload, branchId: config.BRANCH_ID,
  });

  if (event.status === 'duplicate') {
    void reply.send({ success: true, data: { status: 'duplicate' } });
    return;
  }

  if (!parsed.success || parsed.data.status !== 'success') {
    await repo.updateEvent(event.id, { status: 'processed', normalized: payload });
    void reply.send({ success: true, data: { status: 'acknowledged' } });
    return;
  }

  await repo.updateEvent(event.id, { status: 'processed', normalized: parsed.data as unknown as Record<string, unknown> });
  void reply.send({ success: true, data: { status: 'payment_acknowledged', transactionId: parsed.data.transaction_id } });
}

// ── Admin: list events ────────────────────────────────────────────────────

const listSchema = z.object({
  platform: z.string().optional(),
  status:   z.string().optional(),
  limit:    z.coerce.number().default(50),
});

export async function listEvents(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(req.query);
  const events = await repo.listEvents(params);
  void reply.send({ success: true, data: events });
}
