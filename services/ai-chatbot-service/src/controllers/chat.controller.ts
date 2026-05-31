import Anthropic from '@anthropic-ai/sdk';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import * as repo from '../repositories/chat.repository';
import type { JwtPayload } from '@fadl/types';

const anthropic = config.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  : null;

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_AR = `أنت مساعد ذكي لعيادة فضل كلينك. يمكنك:
1. مساعدة المرضى في وصف الأعراض واقتراح التخصص المناسب
2. حجز مواعيد فعلياً في النظام
3. عرض المواعيد المتاحة
4. تسجيل مرضى جدد في النظام
5. إضافة أطباء جدد إلى العيادة

تخصصات العيادة (مع معرّفاتها):
1:النساء والعقم، 2:الأطفال والمواليد، 4:الأسنان، 5:الطب النفسي، 7:الجلدية، 17:السكر والغدد الصماء، 18:الجهاز الهضمي، 24:الباطنة، 25:الأعصاب، 27:الجراحة العامة، 28:المسالك البولية، 30:القلب، 36:الأنف والأذن والحنجرة، 38:العظام، 13:العيون، 32:الأورام، 6:العلاج الطبيعي، 11:التغذية.

قواعد مهمة:
- لا تقدم تشخيصاً طبياً قاطعاً
- اقترح دائماً الكشف الطبي عند الطبيب
- إذا كانت الأعراض خطيرة → وجّه فوراً للطوارئ

عند طلب حجز موعد (تحديد طبيب + مريض + تاريخ + وقت):
أرجع JSON فقط بهذا الشكل بدون أي نص آخر:
{"action":"book_appointment","doctor":"اسم الطبيب","patient":"اسم المريض","date":"YYYY-MM-DD","time":"HH:MM"}

عند طلب عرض مواعيد تاريخ معين:
أرجع JSON فقط بهذا الشكل:
{"action":"get_appointments","date":"YYYY-MM-DD"}

عند طلب تسجيل مريض جديد (يجب توفر الاسم والجوال على الأقل):
أرجع JSON فقط بهذا الشكل:
{"action":"register_patient","nameEn":"Patient Name","nameAr":"اسم المريض","mobile":"01XXXXXXXXX","gender":"male|female","dob":"YYYY-MM-DD","patientSource":"Cl.'s"}

عند طلب إضافة طبيب جديد (يجب توفر الاسم والجوال والتخصص):
أرجع JSON فقط بهذا الشكل:
{"action":"register_doctor","nameEn":"Doctor Name","nameAr":"اسم الطبيب","mobile":"01XXXXXXXXX","specialtyId":1}

عند اقتراح تخصص طبي أضف في نهاية ردك:
{"action":"suggest_specialty","specialty":"اسم التخصص بالعربي","specialtyEn":"Specialty in English","urgency":"routine|urgent|emergency"}

الرد باللغة العربية دائماً.`;

const SYSTEM_PROMPT_EN = `You are a smart medical assistant for Fadl Clinic. You can:
1. Help patients describe symptoms and suggest the right specialty
2. Actually book appointments in the system
3. View available appointments
4. Register new patients in the system
5. Add new doctors to the clinic

Clinic specialties (with IDs):
1:Gynecology & Infertility, 2:Pediatrics & Newborn, 4:Dentistry, 5:Psychiatry, 7:Dermatology, 17:Diabetes & Endocrinology, 18:Gastroenterology, 24:Internal Medicine, 25:Neurology, 27:General Surgery, 28:Urology, 30:Cardiology, 36:ENT, 38:Orthopedics, 13:Ophthalmology, 32:Oncology, 6:Physiotherapy, 11:Dietitian & Nutrition.

Important rules:
- Never give a definitive medical diagnosis
- Always recommend seeing a doctor
- For serious symptoms → direct immediately to emergency

When asked to book an appointment (doctor + patient + date + time specified):
Return ONLY this JSON with no other text:
{"action":"book_appointment","doctor":"doctor name","patient":"patient name","date":"YYYY-MM-DD","time":"HH:MM"}

When asked to show appointments for a date:
Return ONLY this JSON:
{"action":"get_appointments","date":"YYYY-MM-DD"}

When asked to register a new patient (name and mobile required at minimum):
Return ONLY this JSON:
{"action":"register_patient","nameEn":"Patient Name","nameAr":"Arabic Name","mobile":"01XXXXXXXXX","gender":"male|female","dob":"YYYY-MM-DD","patientSource":"Cl.'s"}

When asked to add a new doctor (name, mobile, and specialty required):
Return ONLY this JSON:
{"action":"register_doctor","nameEn":"Doctor Name","nameAr":"Arabic Name","mobile":"01XXXXXXXXX","specialtyId":1}

When suggesting a specialty, append at the end of your response:
{"action":"suggest_specialty","specialty":"Arabic specialty name","specialtyEn":"Specialty in English","urgency":"routine|urgent|emergency"}

Always respond in English.`;

// ── Schema ────────────────────────────────────────────────────────────────────

const messageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message:   z.string().min(1).max(2000),
  language:  z.enum(['ar', 'en']).default('ar'),
  patientId: z.string().uuid().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[^{}]*"action"\s*:[^{}]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── Action executor ───────────────────────────────────────────────────────────

async function executeAction(
  action: Record<string, unknown>,
  authToken: string,
  lang: string,
): Promise<string | null> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };

  if (action.action === 'book_appointment') {
    const doctor  = String(action.doctor  ?? '');
    const patient = String(action.patient ?? '');
    const date    = String(action.date    ?? '');
    const time    = String(action.time    ?? '09:00');

    if (!doctor || !patient || !date) return null;
    if (!DATE_RE.test(date)) {
      return lang === 'ar'
        ? `صيغة التاريخ غير صحيحة. استخدم صيغة YYYY-MM-DD مثل ${new Date().toISOString().split('T')[0]}.`
        : `Invalid date format. Use YYYY-MM-DD, e.g. ${new Date().toISOString().split('T')[0]}.`;
    }
    if (time && !TIME_RE.test(time)) {
      return lang === 'ar'
        ? 'صيغة الوقت غير صحيحة. استخدم صيغة HH:MM مثل 09:00.'
        : 'Invalid time format. Use HH:MM, e.g. 09:00.';
    }

    // Resolve patient by name search
    const patRes = await fetch(
      `${config.PATIENT_SERVICE_URL}/patients?q=${encodeURIComponent(patient)}&limit=1`,
      { headers },
    );
    if (!patRes.ok) {
      return lang === 'ar'
        ? `تعذّر البحث عن المريض "${patient}". يرجى التحقق من الاسم.`
        : `Could not find patient "${patient}". Please check the name.`;
    }
    const patData = await patRes.json() as { data?: { patientId: string; nameEn: string; nameAr?: string }[] };
    const foundPatient = patData.data?.[0];
    if (!foundPatient) {
      return lang === 'ar'
        ? `لم يُعثر على مريض باسم "${patient}". تحقق من الاسم أو سجّل المريض أولاً.`
        : `No patient found with name "${patient}". Please verify or register the patient first.`;
    }

    // Resolve doctor by name search
    const docRes = await fetch(
      `${config.DOCTOR_SERVICE_URL}/doctors?q=${encodeURIComponent(doctor)}&limit=1`,
      { headers },
    );
    if (!docRes.ok) {
      return lang === 'ar'
        ? `تعذّر البحث عن الطبيب "${doctor}".`
        : `Could not find doctor "${doctor}".`;
    }
    const docData = await docRes.json() as { data?: { id: string; nameEn: string; nameAr?: string; specialtyId: number }[] };
    const foundDoctor = docData.data?.[0];
    if (!foundDoctor) {
      return lang === 'ar'
        ? `لم يُعثر على طبيب باسم "${doctor}". تحقق من الاسم.`
        : `No doctor found with name "${doctor}". Please verify the name.`;
    }

    // Create appointment
    const apptBody: Record<string, unknown> = {
      patientId:       foundPatient.patientId,
      doctorId:        foundDoctor.id,
      appointmentDate: date,
      startTime:       time,
      endTime:         addMinutes(time, 30),
      appointmentType: 'in_person',
      patientSource:   "Cl.'s",
      idempotencyKey:  `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      specialtyId:     foundDoctor.specialtyId,
    };
    if (action.paymentMethod) apptBody.paymentMethod = action.paymentMethod;
    if (action.notes)         apptBody.notes         = action.notes;

    const apptRes = await fetch(`${config.APPOINTMENT_SERVICE_URL}/appointments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(apptBody),
    });

    if (!apptRes.ok) {
      const err = await apptRes.json() as { error?: { code?: string; message?: string } };
      if (err.error?.code === 'DOUBLE_BOOKING') {
        return lang === 'ar'
          ? `هذا الوقت محجوز بالفعل للطبيب ${foundDoctor.nameAr ?? foundDoctor.nameEn}. اختر وقتاً مختلفاً.`
          : `This time slot is already booked for ${foundDoctor.nameEn}. Please choose a different time.`;
      }
      return lang === 'ar'
        ? `فشل الحجز: ${err.error?.message ?? 'خطأ غير معروف'}`
        : `Booking failed: ${err.error?.message ?? 'Unknown error'}`;
    }

    const apptData = await apptRes.json() as { data?: { id: string } };
    const apptId = apptData.data?.id;
    const patientName = foundPatient.nameAr ?? foundPatient.nameEn;
    const doctorName  = foundDoctor.nameAr  ?? foundDoctor.nameEn;

    if (!apptId) {
      return lang === 'ar'
        ? '✅ تم إرسال طلب الحجز لكن تعذّر استرداد تفاصيله.'
        : '✅ Booking request sent but could not retrieve appointment details.';
    }

    // Verify the appointment is persisted by fetching it back
    const verifyRes = await fetch(
      `${config.APPOINTMENT_SERVICE_URL}/appointments/${apptId}`,
      { headers },
    );
    const verifiedData = verifyRes.ok
      ? (await verifyRes.json() as { data?: { status: string; queueNumber?: number } }).data
      : null;

    const queueInfo = verifiedData?.queueNumber != null
      ? (lang === 'ar'
          ? `\n• رقم الدور: ${verifiedData.queueNumber}`
          : `\n• Queue #: ${verifiedData.queueNumber}`)
      : '';

    return lang === 'ar'
      ? `✅ تم الحجز بنجاح! ✓ مؤكد\n\nتفاصيل الموعد:\n• المريض: ${patientName}\n• الطبيب: ${doctorName}\n• التاريخ: ${date}\n• الوقت: ${time}${queueInfo}\n• رقم الموعد: ${apptId.slice(-8).toUpperCase()}`
      : `✅ Appointment booked successfully! ✓ verified\n\nDetails:\n• Patient: ${foundPatient.nameEn}\n• Doctor: ${foundDoctor.nameEn}\n• Date: ${date}\n• Time: ${time}${queueInfo}\n• Appointment ID: ${apptId.slice(-8).toUpperCase()}`;
  }

  if (action.action === 'get_appointments') {
    const rawDate = String(action.date ?? new Date().toISOString().split('T')[0]);
    const date = DATE_RE.test(rawDate) ? rawDate : new Date().toISOString().split('T')[0];

    const apptRes = await fetch(
      `${config.APPOINTMENT_SERVICE_URL}/appointments?date=${date}&limit=20`,
      { headers },
    );
    if (!apptRes.ok) {
      return lang === 'ar'
        ? 'تعذّر تحميل المواعيد.'
        : 'Could not load appointments.';
    }

    const apptData = await apptRes.json() as { data?: { id: string; startTime: string; status: string }[]; total?: number };
    const appointments = apptData.data ?? [];
    if (appointments.length === 0) {
      return lang === 'ar'
        ? `لا توجد مواعيد في ${date}.`
        : `No appointments on ${date}.`;
    }

    const lines = appointments.map((a) => `• ${a.startTime} — ${a.status} (${a.id.slice(-6).toUpperCase()})`).join('\n');
    return lang === 'ar'
      ? `مواعيد ${date} (${appointments.length}):\n${lines}`
      : `Appointments for ${date} (${appointments.length}):\n${lines}`;
  }

  if (action.action === 'register_patient') {
    const nameEn = String(action.nameEn ?? '').trim();
    const rawMobile = String(action.mobile ?? '').trim().replace(/\s/g, '');
    // Normalize Egyptian mobile: 01XXXXXXXXX → +201XXXXXXXXX
    const mobile = rawMobile.startsWith('+20')
      ? rawMobile
      : rawMobile.startsWith('20')
        ? `+${rawMobile}`
        : rawMobile.startsWith('0')
          ? `+2${rawMobile}`
          : `+20${rawMobile}`;

    if (!nameEn || !rawMobile) {
      return lang === 'ar'
        ? 'يرجى تقديم اسم المريض ورقم الجوال على الأقل لإتمام التسجيل.'
        : 'Please provide at least the patient name and mobile number to complete registration.';
    }

    // Normalize gender: male→M, female→F
    const rawGender = String(action.gender ?? '').toLowerCase();
    const gender = rawGender === 'male' || rawGender === 'm' ? 'M'
      : rawGender === 'female' || rawGender === 'f' ? 'F'
      : undefined;

    const body: Record<string, unknown> = {
      nameEn,
      mobile,
      patientSource: String(action.patientSource ?? "Cl.'s"),
    };
    if (action.nameAr)  body.nameAr  = String(action.nameAr);
    if (gender)         body.gender  = gender;
    if (action.dob && DATE_RE.test(String(action.dob))) body.dob = String(action.dob);

    const res = await fetch(`${config.PATIENT_SERVICE_URL}/patients`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return lang === 'ar'
        ? `فشل تسجيل المريض: ${err.error?.message ?? 'خطأ غير معروف'}`
        : `Patient registration failed: ${err.error?.message ?? 'Unknown error'}`;
    }

    const data = await res.json() as { data?: { patientId?: string; id?: string } };
    const pid  = (data.data?.patientId ?? data.data?.id ?? '').slice(-8).toUpperCase();
    return lang === 'ar'
      ? `✅ تم تسجيل المريض بنجاح!\n\n• الاسم: ${nameEn}${action.nameAr ? ` / ${String(action.nameAr)}` : ''}\n• الجوال: ${mobile}\n• رقم المريض: ${pid}`
      : `✅ Patient registered successfully!\n\n• Name: ${nameEn}${action.nameAr ? ` / ${String(action.nameAr)}` : ''}\n• Mobile: ${mobile}\n• Patient ID: ${pid}`;
  }

  if (action.action === 'register_doctor') {
    const nameEn      = String(action.nameEn ?? '').trim();
    const rawMobile   = String(action.mobile ?? '').trim().replace(/\s/g, '');
    const mobile      = rawMobile.startsWith('+20') ? rawMobile
      : rawMobile.startsWith('20') ? `+${rawMobile}`
      : rawMobile.startsWith('0')  ? `+2${rawMobile}`
      : `+20${rawMobile}`;
    const specialtyId = Number(action.specialtyId ?? 0);

    if (!nameEn || !rawMobile || !specialtyId) {
      return lang === 'ar'
        ? 'يرجى تقديم اسم الطبيب ورقم الجوال والتخصص لإتمام الإضافة.'
        : 'Please provide the doctor name, mobile number, and specialty to complete registration.';
    }

    const body: Record<string, unknown> = {
      nameEn,
      mobile,
      specialtyId,
      revenueSplits: {
        consultation: { clinicPercentage: 30, doctorPercentage: 70 },
        operative:    { clinicPercentage: 20, doctorPercentage: 80 },
        online:       { clinicPercentage: 30, doctorPercentage: 70 },
      },
    };
    if (action.nameAr) body.nameAr = String(action.nameAr);

    const res = await fetch(`${config.DOCTOR_SERVICE_URL}/doctors`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return lang === 'ar'
        ? `فشل إضافة الطبيب: ${err.error?.message ?? 'خطأ غير معروف'}`
        : `Doctor registration failed: ${err.error?.message ?? 'Unknown error'}`;
    }

    const data = await res.json() as { data?: { id?: string } };
    const did  = (data.data?.id ?? '').slice(-8).toUpperCase();
    return lang === 'ar'
      ? `✅ تم إضافة الطبيب بنجاح!\n\n• الاسم: ${nameEn}${action.nameAr ? ` / ${String(action.nameAr)}` : ''}\n• الجوال: ${mobile}\n• التخصص: ${specialtyId}\n• رقم الطبيب: ${did}`
      : `✅ Doctor registered successfully!\n\n• Name: ${nameEn}${action.nameAr ? ` / ${String(action.nameAr)}` : ''}\n• Mobile: ${mobile}\n• Specialty ID: ${specialtyId}\n• Doctor ID: ${did}`;
  }

  return null;
}

// ── Pending-booking multi-turn types & helpers ────────────────────────────────

interface PendingBooking {
  stage: 'awaiting_payment' | 'awaiting_extras';
  action: Record<string, unknown>;
  paymentMethod?: 'cash' | 'visa' | 'instapay';
}

function normalizePaymentMethod(input: string): 'cash' | 'visa' | 'instapay' {
  const lower = input.toLowerCase();
  if (/cash|نقد|كاش|نقداً|نقدا/.test(lower)) return 'cash';
  if (/visa|card|بطاق|كارت|فيزا|credit|debit/.test(lower)) return 'visa';
  if (/instapay|insta|انستا|إنستا/.test(lower)) return 'instapay';
  return 'cash'; // default
}

function paymentMethodLabel(method: string, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return method === 'visa' ? 'بطاقة ائتمانية' : method === 'instapay' ? 'انستاباي' : 'نقداً';
  }
  return method === 'visa' ? 'Card (Visa)' : method === 'instapay' ? 'InstaPay' : 'Cash';
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function sendMessage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user  = request.user as JwtPayload;
  const input = messageSchema.parse(request.body);

  // Extract the bearer token to forward to internal services
  const authHeader = request.headers.authorization ?? '';
  const authToken  = authHeader.replace(/^Bearer\s+/i, '');

  // Get or create session
  let session = input.sessionId ? await repo.getSession(input.sessionId) : null;
  if (!session) {
    session = await repo.createSession(input.patientId ?? user.sub, input.language, user.branchId ?? 1);
  }

  // Get conversation history
  const history = await repo.getSessionHistory(session.id, config.MAX_HISTORY_TURNS * 2);

  // Save user message
  await repo.saveMessage(session.id, 'user', input.message);

  // ── Pending booking: multi-turn payment + extras collection ──────────────
  const ctx = (session.context ?? {}) as Record<string, unknown>;
  const pending = ctx.pendingBooking as PendingBooking | undefined;

  if (pending?.stage === 'awaiting_payment') {
    const paymentMethod = normalizePaymentMethod(input.message);
    const updated: PendingBooking = { ...pending, stage: 'awaiting_extras', paymentMethod };
    await repo.updateSessionContext(session.id, { ...ctx, pendingBooking: updated });

    const extrasQ = session.language === 'ar'
      ? `شكراً! طريقة الدفع: ${paymentMethodLabel(paymentMethod, 'ar')}.\n\nهل هناك خدمات إضافية مطلوبة أو مستندات للرفع للطبيب؟\n(مثلاً: تحاليل، أشعة، تقارير طبية)\nأو اكتب "لا" إذا لم يكن هناك شيء إضافي.`
      : `Thank you! Payment method: ${paymentMethodLabel(paymentMethod, 'en')}.\n\nAre there any additional services needed or documents to upload for the doctor?\n(e.g., lab results, X-rays, medical reports)\nOr type "no" if nothing else is needed.`;

    await repo.saveMessage(session.id, 'assistant', extrasQ, {});
    void reply.send({ success: true, data: { sessionId: session.id, reply: extrasQ, action: null, language: session.language } });
    return;
  }

  if (pending?.stage === 'awaiting_extras') {
    const noPattern = /^(لا|لأ|no|none|nothing|لا\s*شيء|لاشيء)$/i;
    const hasExtras = !noPattern.test(input.message.trim());
    const notes = hasExtras ? input.message.trim() : undefined;

    const bookAction = { ...pending.action, paymentMethod: pending.paymentMethod, ...(notes ? { notes } : {}) };
    const { pendingBooking: _removed, ...restCtx } = ctx;
    await repo.updateSessionContext(session.id, restCtx);

    const executionResult = await executeAction(bookAction, authToken, session.language);
    const finalReply = executionResult ?? (session.language === 'ar' ? 'حدث خطأ أثناء الحجز.' : 'Booking error.');

    const actionResult = { ...bookAction, result: 'executed' };
    await repo.saveMessage(session.id, 'assistant', finalReply, { action: actionResult });
    await repo.updateSessionContext(session.id, { ...restCtx, lastAction: actionResult });

    void reply.send({ success: true, data: { sessionId: session.id, reply: finalReply, action: actionResult, language: session.language } });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Build messages
  const chatMessages = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: input.message },
  ];

  const systemPrompt = session.language === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;

  let rawReply: string;

  if (config.OPENROUTER_API_KEY) {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://fadl-clinic.app',
        'X-Title': 'Fadl Clinic AI Assistant',
      },
      body: JSON.stringify({
        model: config.OPENROUTER_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
      }),
    });
    if (!orRes.ok) {
      const errBody = await orRes.text();
      throw new Error(`OpenRouter error ${orRes.status}: ${errBody}`);
    }
    const orJson = await orRes.json() as { choices: { message: { content: string } }[] };
    rawReply = orJson.choices[0]?.message?.content ?? '';
  } else if (anthropic) {
    const claudeResponse = await anthropic.messages.create({
      model:      config.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   chatMessages.map((m) => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      })) as Anthropic.MessageParam[],
    });
    rawReply = (claudeResponse.content[0] as { type: string; text: string }).text ?? '';
  } else {
    rawReply = session.language === 'ar'
      ? 'عذراً، خدمة المساعد الذكي غير متاحة حالياً. يرجى الاتصال بالعيادة مباشرة.'
      : 'Sorry, the AI assistant is not configured. Please contact the clinic directly.';
  }

  // Extract structured action from model response
  const action = extractJson(rawReply);

  // For executable actions (book/get), try to run them and replace the reply
  let finalReply: string;
  let actionResult: Record<string, unknown> | null = null;

  if (action && ['book_appointment', 'get_appointments', 'register_patient', 'register_doctor'].includes(String(action.action))) {
    // Role guard: only admin and receptionist may book appointments
    if (action.action === 'book_appointment' && !['admin', 'receptionist'].includes(user.role)) {
      finalReply = session.language === 'ar'
        ? 'عذراً، حجز المواعيد مقتصر على موظفي الاستقبال والمسؤولين.'
        : 'Sorry, booking appointments is restricted to receptionists and admins.';
      actionResult = { ...action, result: 'permission_denied' };
    } else if (action.action === 'book_appointment') {
      // Start multi-turn collection: ask for payment method first
      const pendingBooking: PendingBooking = { stage: 'awaiting_payment', action: { ...action } };
      await repo.updateSessionContext(session.id, { ...ctx, pendingBooking });

      finalReply = session.language === 'ar'
        ? `رائع! تفاصيل الموعد:\n• المريض: ${action.patient}\n• الطبيب: ${action.doctor}\n• التاريخ: ${action.date}\n• الوقت: ${action.time}\n\nما طريقة الدفع المفضلة؟\n💵 نقداً | 💳 بطاقة (Visa) | 📱 انستاباي`
        : `Great! Appointment details:\n• Patient: ${action.patient}\n• Doctor: ${action.doctor}\n• Date: ${action.date}\n• Time: ${action.time}\n\nWhat is the preferred payment method?\n💵 Cash | 💳 Card (Visa) | 📱 InstaPay`;
      actionResult = { ...action, result: 'awaiting_payment' };
    } else {
      // The model returned a pure-JSON action — execute it
      const executionResult = await executeAction(action, authToken, session.language);
      finalReply  = executionResult ?? rawReply;
      actionResult = executionResult ? { ...action, result: 'executed' } : action;
    }
  } else {
    // Regular reply or suggest_specialty — strip inline JSON from visible text
    finalReply  = rawReply.replace(/\{[^{}]*"action"\s*:[^{}]*\}/g, '').trim();
    actionResult = action;
  }

  // Save assistant reply
  await repo.saveMessage(session.id, 'assistant', finalReply, actionResult ? { action: actionResult } : {});

  // Update session context with latest action
  if (actionResult) {
    await repo.updateSessionContext(session.id, { ...ctx, lastAction: actionResult });
  }

  void reply.send({
    success: true,
    data: {
      sessionId: session.id,
      reply:     finalReply,
      action:    actionResult ?? null,
      language:  session.language,
    },
  });
}

export async function getSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const session = await repo.getSession(id);
  if (!session) {
    void reply.status(404).send({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Chat session not found' } });
    return;
  }
  const history = await repo.getSessionHistory(id, 100);
  void reply.send({ success: true, data: { session, messages: history } });
}

// ── Name transliteration ──────────────────────────────────────────────────────

const translateNameSchema = z.object({
  name: z.string().min(1).max(200),
  from: z.enum(['ar', 'en']),
});

export async function translateName(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { name, from } = translateNameSchema.parse(request.body);

  const prompt = from === 'ar'
    ? `Transliterate this Arabic name into English (phonetic only). Return ONLY the transliterated name, nothing else.\nName: ${name}`
    : `Transliterate this English name into Arabic (phonetic only). Return ONLY the Arabic transliteration, nothing else.\nName: ${name}`;

  let transliterated: string;

  if (config.OPENROUTER_API_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer':  'https://fadl-clinic.app',
        'X-Title':       'Fadl Clinic AI Assistant',
      },
      body: JSON.stringify({
        model:      config.OPENROUTER_MODEL,
        max_tokens: 60,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
    const json = await res.json() as { choices: { message: { content: string } }[] };
    transliterated = (json.choices[0]?.message?.content ?? '').trim();
  } else if (anthropic) {
    const r = await anthropic.messages.create({
      model:      config.ANTHROPIC_MODEL,
      max_tokens: 60,
      messages:   [{ role: 'user', content: prompt }],
    });
    transliterated = ((r.content[0] as { text: string }).text ?? '').trim();
  } else {
    void reply.status(503).send({ success: false, error: { code: 'NO_AI', message: 'No AI provider configured' } });
    return;
  }

  void reply.send({ success: true, data: { transliterated } });
}
