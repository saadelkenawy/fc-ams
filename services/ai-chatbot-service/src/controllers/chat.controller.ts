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

تخصصات العيادة: النساء والعقم، القلب والأوعية الدموية، الجلدية، الأطفال والمواليد، الباطنة، العظام، الأنف والأذن والحنجرة، العيون، الجراحة العامة، طب الأسنان، الأعصاب، الطب النفسي، الأورام، المسالك البولية، الغدد الصماء، التغذية.

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

عند اقتراح تخصص طبي أضف في نهاية ردك:
{"action":"suggest_specialty","specialty":"اسم التخصص بالعربي","specialtyEn":"Specialty in English","urgency":"routine|urgent|emergency"}

الرد باللغة العربية دائماً.`;

const SYSTEM_PROMPT_EN = `You are a smart medical assistant for Fadl Clinic. You can:
1. Help patients describe symptoms and suggest the right specialty
2. Actually book appointments in the system
3. View available appointments

Clinic specialties: Gynecology & Infertility, Cardiology, Dermatology, Pediatrics & Newborn, Internal Medicine, Orthopedics, ENT, Ophthalmology, General Surgery, Dentistry, Neurology, Psychiatry, Oncology, Urology, Endocrinology, Nutrition.

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
    const apptRes = await fetch(`${config.APPOINTMENT_SERVICE_URL}/appointments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        patientId:       foundPatient.patientId,
        doctorId:        foundDoctor.id,
        appointmentDate: date,
        startTime:       time,
        endTime:         addMinutes(time, 30),
        appointmentType: 'in_person',
        patientSource:   "Cl.'s",
        idempotencyKey:  `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        specialtyId:     foundDoctor.specialtyId,
      }),
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
    const apptId = apptData.data?.id ?? 'unknown';
    const patientName = foundPatient.nameAr ?? foundPatient.nameEn;
    const doctorName  = foundDoctor.nameAr  ?? foundDoctor.nameEn;

    return lang === 'ar'
      ? `✅ تم الحجز بنجاح!\n\nتفاصيل الموعد:\n• المريض: ${patientName}\n• الطبيب: ${doctorName}\n• التاريخ: ${date}\n• الوقت: ${time}\n• رقم الموعد: ${apptId.slice(-8).toUpperCase()}`
      : `✅ Appointment booked successfully!\n\nDetails:\n• Patient: ${foundPatient.nameEn}\n• Doctor: ${foundDoctor.nameEn}\n• Date: ${date}\n• Time: ${time}\n• Appointment ID: ${apptId.slice(-8).toUpperCase()}`;
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

  return null;
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

  if (action && (action.action === 'book_appointment' || action.action === 'get_appointments')) {
    // The model returned a pure-JSON action — execute it
    const executionResult = await executeAction(action, authToken, session.language);
    finalReply  = executionResult ?? rawReply;
    actionResult = executionResult ? { ...action, result: 'executed' } : action;
  } else {
    // Regular reply or suggest_specialty — strip inline JSON from visible text
    finalReply  = rawReply.replace(/\{[^{}]*"action"\s*:[^{}]*\}/g, '').trim();
    actionResult = action;
  }

  // Save assistant reply
  await repo.saveMessage(session.id, 'assistant', finalReply, actionResult ? { action: actionResult } : {});

  // Update session context with latest action
  if (actionResult) {
    await repo.updateSessionContext(session.id, { ...session.context, lastAction: actionResult });
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
