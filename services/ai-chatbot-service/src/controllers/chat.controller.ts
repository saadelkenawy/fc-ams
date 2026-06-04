import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
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
6. عرض قائمة الأطباء حسب التخصص مع أيام العمل

تخصصات العيادة (مع معرّفاتها):
1:النساء والعقم، 2:الأطفال والمواليد، 4:الأسنان، 5:الطب النفسي، 7:الجلدية، 17:السكر والغدد الصماء، 18:الجهاز الهضمي، 24:الباطنة، 25:الأعصاب، 27:الجراحة العامة، 28:المسالك البولية، 30:القلب، 36:الأنف والأذن والحنجرة، 38:العظام، 13:العيون، 32:الأورام، 6:العلاج الطبيعي، 11:التغذية.

قواعد تحديد الإجراء:
- إذا ذكر المستخدم اسم طبيب محدد + مريض + تاريخ + وقت → book_appointment
- إذا ذكر المستخدم تخصصاً بعينه (مثل قلب أو أسنان) ويريد معرفة الأطباء → list_doctors
- إذا طلب طبيباً أو حجزاً دون تحديد تخصص أو طبيب → ask_specialty

قواعد مهمة:
- لا تقدم تشخيصاً طبياً قاطعاً
- اقترح دائماً الكشف الطبي عند الطبيب
- إذا كانت الأعراض خطيرة → وجّه فوراً للطوارئ

عند طلب حجز موعد (تحديد طبيب + مريض + تاريخ + وقت):
أرجع JSON فقط بهذا الشكل بدون أي نص آخر:
{"action":"book_appointment","doctor":"اسم الطبيب","patient":"اسم المريض","date":"YYYY-MM-DD","time":"HH:MM"}

عند طلب عرض أطباء تخصص معين (ذُكر التخصص صراحةً):
أرجع JSON فقط بهذا الشكل:
{"action":"list_doctors","specialtyId":30}

عند طلب طبيب أو حجز دون تحديد تخصص:
أرجع JSON فقط بهذا الشكل:
{"action":"ask_specialty"}

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
6. List doctors by specialty with their working days

Clinic specialties (with IDs):
1:Gynecology & Infertility, 2:Pediatrics & Newborn, 4:Dentistry, 5:Psychiatry, 7:Dermatology, 17:Diabetes & Endocrinology, 18:Gastroenterology, 24:Internal Medicine, 25:Neurology, 27:General Surgery, 28:Urology, 30:Cardiology, 36:ENT, 38:Orthopedics, 13:Ophthalmology, 32:Oncology, 6:Physiotherapy, 11:Dietitian & Nutrition.

Action selection rules:
- Specific doctor name + patient + date + time → book_appointment
- User names a specialty and wants to see doctors → list_doctors
- User asks about a doctor or booking without specifying specialty → ask_specialty

Important rules:
- Never give a definitive medical diagnosis
- Always recommend seeing a doctor
- For serious symptoms → direct immediately to emergency

When asked to book an appointment (doctor + patient + date + time specified):
Return ONLY this JSON with no other text:
{"action":"book_appointment","doctor":"doctor name","patient":"patient name","date":"YYYY-MM-DD","time":"HH:MM"}

When asked to list doctors for a specific specialty (specialty is explicitly named):
Return ONLY this JSON:
{"action":"list_doctors","specialtyId":30}

When the user asks about a doctor or booking without specifying a specialty:
Return ONLY this JSON:
{"action":"ask_specialty"}

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

function normalizeNumericInput(s: string): number | null {
  // Normalize Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII
  const normalized = s.trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  const n = parseFloat(normalized);
  return isFinite(n) && n >= 0 ? n : null;
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

    // Resolve patient — use pre-resolved candidate when available (set during disambiguation)
    let foundPatient: PatientCandidate;
    if (action.preResolvedPatient) {
      foundPatient = action.preResolvedPatient as PatientCandidate;
    } else {
      const patRes = await fetch(
        `${config.PATIENT_SERVICE_URL}/patients?query=${encodeURIComponent(patient)}&limit=1`,
        { headers },
      );
      if (!patRes.ok) {
        return lang === 'ar'
          ? `تعذّر البحث عن المريض "${patient}". يرجى التحقق من الاسم.`
          : `Could not find patient "${patient}". Please check the name.`;
      }
      const patData = await patRes.json() as { data?: PatientCandidate[] };
      const resolved = patData.data?.[0];
      if (!resolved) {
        return lang === 'ar'
          ? `لم يُعثر على مريض باسم "${patient}". تحقق من الاسم أو سجّل المريض أولاً.`
          : `No patient found with name "${patient}". Please verify or register the patient first.`;
      }
      foundPatient = resolved;
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
      idempotencyKey:  `chat-${Date.now()}-${randomBytes(8).toString('hex')}`,
      specialtyId:     foundDoctor.specialtyId,
    };
    if (action.approvedCharge) apptBody.approvedCharge = Number(action.approvedCharge);
    if (action.paymentMethod)  apptBody.paymentMethod  = action.paymentMethod;
    if (action.notes)          apptBody.notes          = action.notes;

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

    const chargeInfo = action.approvedCharge
      ? (lang === 'ar' ? `\n• التعرفة: ${action.approvedCharge} ج.م` : `\n• Fee: ${action.approvedCharge} EGP`)
      : '';
    const pmInfo = action.paymentMethod
      ? (lang === 'ar' ? `\n• الدفع: ${paymentMethodLabel(String(action.paymentMethod), 'ar')}` : `\n• Payment: ${paymentMethodLabel(String(action.paymentMethod), 'en')}`)
      : '';

    return lang === 'ar'
      ? `✅ تم الحجز بنجاح! ✓ مؤكد\n\nتفاصيل الموعد:\n• المريض: ${patientName}\n• الطبيب: ${doctorName}\n• التاريخ: ${date}\n• الوقت: ${time}${chargeInfo}${pmInfo}${queueInfo}\n• رقم الموعد: ${apptId.slice(-8).toUpperCase()}`
      : `✅ Appointment booked successfully! ✓ verified\n\nDetails:\n• Patient: ${foundPatient.nameEn}\n• Doctor: ${foundDoctor.nameEn}\n• Date: ${date}\n• Time: ${time}${chargeInfo}${pmInfo}${queueInfo}\n• Appointment ID: ${apptId.slice(-8).toUpperCase()}`;
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
      sourceFirstVisit: String(action.patientSource ?? action.sourceFirstVisit ?? "Cl.'s"),
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
  stage: 'awaiting_charge' | 'awaiting_payment' | 'awaiting_extras';
  action: Record<string, unknown>;
  paymentMethod?: 'cash' | 'visa' | 'instapay';
  charge?: number;
}

interface PendingDoctorSearch {
  stage: 'awaiting_specialty';
}

interface PatientCandidate {
  patientId: string;
  nameEn: string;
  nameAr?: string;
}

interface PendingPatientDisambiguation {
  stage: 'awaiting_patient_full_name';
  action: Record<string, unknown>;
  candidates: PatientCandidate[];
}

interface PendingPatientCreation {
  stage: 'awaiting_mobile_for_new_patient' | 'confirming_existing_patient';
  action: Record<string, unknown>;
  nameEn: string;
  conflictPatient?: PatientCandidate;
}

// Egyptian mobile: 010/011/012/015 XXXXXXXX (with or without +20 prefix)
const MOBILE_INPUT_RE = /^(?:\+?20)?0?1[0-25]\d{8}$/;

function normalizeMobile(raw: string): string {
  const s = raw.replace(/[\s\-]/g, '');
  if (s.startsWith('+20')) return s;
  if (s.startsWith('20'))  return `+${s}`;
  if (s.startsWith('0'))   return `+2${s}`;
  return `+20${s}`;
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

// ── Specialty data ────────────────────────────────────────────────────────────

const SPECIALTY_NAMES: Record<number, { ar: string; en: string }> = {
  1:  { ar: 'النساء والعقم',       en: 'Gynecology & Infertility' },
  2:  { ar: 'الأطفال والمواليد',   en: 'Pediatrics & Newborn' },
  4:  { ar: 'الأسنان',             en: 'Dentistry' },
  5:  { ar: 'الطب النفسي',         en: 'Psychiatry' },
  6:  { ar: 'العلاج الطبيعي',      en: 'Physiotherapy' },
  7:  { ar: 'الجلدية',             en: 'Dermatology' },
  11: { ar: 'التغذية',             en: 'Dietitian & Nutrition' },
  13: { ar: 'العيون',              en: 'Ophthalmology' },
  17: { ar: 'السكر والغدد الصماء', en: 'Diabetes & Endocrinology' },
  18: { ar: 'الجهاز الهضمي',      en: 'Gastroenterology' },
  24: { ar: 'الباطنة',             en: 'Internal Medicine' },
  25: { ar: 'الأعصاب',             en: 'Neurology' },
  27: { ar: 'الجراحة العامة',      en: 'General Surgery' },
  28: { ar: 'المسالك البولية',     en: 'Urology' },
  30: { ar: 'القلب',               en: 'Cardiology' },
  32: { ar: 'الأورام',             en: 'Oncology' },
  36: { ar: 'الأنف والأذن والحنجرة', en: 'ENT' },
  38: { ar: 'العظام',              en: 'Orthopedics' },
};

// Maps common Arabic/English terms and numeric strings → specialtyId
const SPECIALTY_MAP: Record<string, number> = {
  // numeric
  '1': 1, '2': 2, '4': 4, '5': 5, '6': 6, '7': 7, '11': 11,
  '13': 13, '17': 17, '18': 18, '24': 24, '25': 25, '27': 27,
  '28': 28, '30': 30, '32': 32, '36': 36, '38': 38,
  // exact Arabic from system prompt
  'النساء والعقم': 1, 'الأطفال والمواليد': 2, 'الأسنان': 4,
  'الطب النفسي': 5, 'العلاج الطبيعي': 6, 'الجلدية': 7, 'التغذية': 11,
  'العيون': 13, 'السكر والغدد الصماء': 17, 'الجهاز الهضمي': 18,
  'الباطنة': 24, 'الأعصاب': 25, 'الجراحة العامة': 27, 'المسالك البولية': 28,
  'القلب': 30, 'الأورام': 32, 'الأنف والأذن والحنجرة': 36, 'العظام': 38,
  // Arabic short forms
  'نساء': 1, 'نسائية': 1, 'عقم': 1, 'أطفال': 2, 'اطفال': 2, 'مواليد': 2,
  'اسنان': 4, 'أسنان': 4, 'نفسي': 5, 'نفسية': 5, 'طبيعي': 6,
  'جلد': 7, 'جلدية': 7, 'تغذية': 11, 'عيون': 13, 'عين': 13,
  'سكر': 17, 'سكري': 17, 'غدد': 17, 'معدة': 18, 'هضمي': 18,
  'باطنه': 24, 'داخلية': 24, 'اعصاب': 25, 'أعصاب': 25, 'عصبية': 25,
  'جراحة': 27, 'جراح': 27, 'مسالك': 28, 'بولية': 28,
  'قلب': 30, 'قلبية': 30, 'اورام': 32, 'أورام': 32, 'سرطان': 32,
  'أذن': 36, 'انف': 36, 'أنف': 36, 'حنجرة': 36, 'عظام': 38, 'عظم': 38, 'مفاصل': 38,
  // English
  'gynecology': 1, 'obstetrics': 1, 'infertility': 1,
  'pediatrics': 2, 'pediatric': 2, 'children': 2, 'newborn': 2,
  'dentistry': 4, 'dental': 4, 'teeth': 4,
  'psychiatry': 5, 'mental health': 5,
  'physiotherapy': 6, 'physical therapy': 6, 'rehabilitation': 6,
  'dermatology': 7, 'skin': 7,
  'nutrition': 11, 'dietitian': 11, 'diet': 11,
  'ophthalmology': 13, 'eye': 13, 'eyes': 13,
  'diabetes': 17, 'endocrinology': 17, 'endocrine': 17,
  'gastroenterology': 18, 'gastro': 18, 'digestive': 18,
  'internal medicine': 24, 'internal': 24,
  'neurology': 25, 'neuro': 25,
  'surgery': 27, 'general surgery': 27,
  'urology': 28, 'urinary': 28,
  'cardiology': 30, 'cardiac': 30, 'heart': 30,
  'oncology': 32, 'cancer': 32,
  'ent': 36, 'ear': 36, 'nose': 36, 'throat': 36,
  'orthopedics': 38, 'orthopedic': 38, 'bone': 38, 'bones': 38, 'joints': 38,
};

function resolveSpecialtyId(input: string): number | null {
  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && SPECIALTY_NAMES[num]) return num;
  const lower = trimmed.toLowerCase();
  return SPECIALTY_MAP[trimmed] ?? SPECIALTY_MAP[lower] ?? null;
}

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function fetchDoctorsBySpecialty(
  specialtyId: number,
  authToken: string,
  lang: string,
): Promise<string> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };

  const res = await fetch(
    `${config.DOCTOR_SERVICE_URL}/doctors?specialtyId=${specialtyId}&isActive=true&limit=50`,
    { headers },
  );
  if (!res.ok) {
    return lang === 'ar' ? 'تعذّر تحميل قائمة الأطباء.' : 'Could not load doctors list.';
  }

  const data = await res.json() as { data?: { id: string; nameEn: string; nameAr?: string }[]; total?: number };
  const doctors = data.data ?? [];
  const specName = SPECIALTY_NAMES[specialtyId];

  if (doctors.length === 0) {
    return lang === 'ar'
      ? `لا يوجد أطباء متاحون في تخصص ${specName?.ar ?? 'هذا التخصص'} حالياً.`
      : `No doctors available in ${specName?.en ?? 'this specialty'} at the moment.`;
  }

  // Fetch schedules for up to 10 doctors in parallel
  const topDoctors = doctors.slice(0, 10);
  const schedulesResults = await Promise.all(
    topDoctors.map(async (doc) => {
      const schRes = await fetch(
        `${config.DOCTOR_SERVICE_URL}/doctors/${doc.id}/schedules`,
        { headers },
      );
      if (!schRes.ok) return [] as { dayOfWeek: number; startTime: string; endTime: string }[];
      const schData = await schRes.json() as { data?: { dayOfWeek: number; startTime: string; endTime: string }[] };
      return schData.data ?? [];
    }),
  );

  const totalLabel = data.total && data.total > 10
    ? ` (${lang === 'ar' ? `يُعرض 10 من ${data.total}` : `showing 10 of ${data.total}`})`
    : ` (${doctors.length})`;
  const header = lang === 'ar'
    ? `أطباء تخصص ${specName?.ar ?? ''}${totalLabel}:\n`
    : `Doctors — ${specName?.en ?? ''}${totalLabel}:\n`;

  const lines = topDoctors.map((doc, i) => {
    const name = lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn;
    const schedules = schedulesResults[i] ?? [];

    if (schedules.length === 0) {
      return lang === 'ar' ? `• ${name} — (لم يُحدَّد جدول)` : `• ${name} — (no schedule set)`;
    }

    const byDay: Record<number, { start: string; end: string }[]> = {};
    for (const s of schedules) {
      if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = [];
      byDay[s.dayOfWeek].push({ start: s.startTime, end: s.endTime });
    }

    const dayStr = Object.entries(byDay)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, slots]) => {
        const dayName = lang === 'ar' ? DAY_NAMES_AR[Number(day)] : DAY_NAMES_EN[Number(day)];
        const times = slots.map((s) => `${s.start}–${s.end}`).join(', ');
        return `${dayName} ${times}`;
      })
      .join(' | ');

    return `• ${name} — ${dayStr}`;
  });

  const footer = lang === 'ar'
    ? '\n\nللحجز مع أي طبيب، أخبرني باسمه واسم المريض والتاريخ والوقت.'
    : '\n\nTo book with any doctor, tell me their name, patient name, date, and time.';

  return header + lines.join('\n') + footer;
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function sendMessage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user  = request.user as JwtPayload;
  const input = messageSchema.parse(request.body);

  // Extract the bearer token to forward to internal services
  const authHeader = request.headers.authorization ?? '';
  const authToken  = authHeader.replace(/^Bearer\s+/i, '');

  // Get or create session
  let session = input.sessionId ? await repo.getSession(input.sessionId, user.branchId ?? 1) : null;
  if (!session) {
    session = await repo.createSession(input.patientId ?? user.sub, input.language, user.branchId ?? 1);
  }

  // Get conversation history
  const history = await repo.getSessionHistory(session.id, config.MAX_HISTORY_TURNS * 2);

  // Save user message
  await repo.saveMessage(session.id, 'user', input.message);

  // ── Pending doctor search: specialty selection ────────────────────────────
  const ctx = (session.context ?? {}) as Record<string, unknown>;

  // ── Pending patient disambiguation: full-name collection ─────────────────
  const pendingPatientDisambig = ctx.pendingPatientDisambig as PendingPatientDisambiguation | undefined;

  if (pendingPatientDisambig?.stage === 'awaiting_patient_full_name') {
    const fullName = input.message.trim();

    // Escape hatch — let user cancel or restart without being stuck in this state
    const CANCEL_RE = /^(إلغاء|الغاء|cancel|exit|quit|stop|انتهى|خروج|back|رجوع|بداية|حجز\s*جديد|new\s*booking)$/i;
    if (!fullName || CANCEL_RE.test(fullName)) {
      const { pendingPatientDisambig: _removed, ...restCtx } = ctx;
      await repo.updateSessionContext(session.id, restCtx);
      const cancelMsg = !fullName
        ? (session.language === 'ar' ? 'يرجى كتابة الاسم الكامل للمريض.' : 'Please enter the patient full name.')
        : (session.language === 'ar' ? 'تم إلغاء البحث. كيف يمكنني مساعدتك؟' : 'Search cancelled. How can I help you?');
      await repo.saveMessage(session.id, 'assistant', cancelMsg, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: cancelMsg, action: null, language: session.language } });
      return;
    }

    const disambigHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // Detect if the user provided a mobile number instead of a name
    const cleanedDisambigInput = fullName.replace(/[\s\-]/g, '');
    const isDisambigMobile = MOBILE_INPUT_RE.test(cleanedDisambigInput);

    let patRes: Response;
    if (isDisambigMobile) {
      const normalizedMobile = normalizeMobile(cleanedDisambigInput);
      patRes = await fetch(
        `${config.PATIENT_SERVICE_URL}/patients?mobile=${encodeURIComponent(normalizedMobile)}&limit=1`,
        { headers: disambigHeaders },
      );
    } else {
      patRes = await fetch(
        `${config.PATIENT_SERVICE_URL}/patients?query=${encodeURIComponent(fullName)}&limit=10`,
        { headers: disambigHeaders },
      );
    }

    if (!patRes.ok) {
      const errMsg = session.language === 'ar'
        ? 'تعذّر البحث. يرجى المحاولة مرة أخرى.'
        : 'Search failed. Please try again.';
      await repo.saveMessage(session.id, 'assistant', errMsg, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: errMsg, action: null, language: session.language } });
      return;
    }

    const patData = await patRes.json() as { data?: PatientCandidate[] };
    const candidates = patData.data ?? [];

    if (candidates.length === 0) {
      const { pendingPatientDisambig: _removed, ...restCtx } = ctx;
      const origPatientName = String(pendingPatientDisambig.action.patient ?? fullName);

      if (isDisambigMobile) {
        // Mobile searched — no patient found, offer to create with this mobile
        const pendingCreation: PendingPatientCreation = {
          stage: 'awaiting_mobile_for_new_patient',
          action: pendingPatientDisambig.action,
          nameEn: origPatientName,
        };
        await repo.updateSessionContext(session.id, { ...restCtx, pendingPatientCreation: pendingCreation });
        const notFoundMsg = session.language === 'ar'
          ? `لم يُعثر على مريض برقم الجوال هذا.\n\nيمكنك تسجيل "${origPatientName}" كمريض جديد. أدخل رقم جواله (أو رقماً مختلفاً)، أو اكتب "إلغاء" للرجوع.`
          : `No patient found with that mobile.\n\nYou can register "${origPatientName}" as a new patient. Enter their mobile number (or a different one), or type "cancel" to go back.`;
        await repo.saveMessage(session.id, 'assistant', notFoundMsg, {});
        void reply.send({ success: true, data: { sessionId: session.id, reply: notFoundMsg, action: null, language: session.language } });
        return;
      }

      // Name search returned 0 — offer to create
      const pendingCreation: PendingPatientCreation = {
        stage: 'awaiting_mobile_for_new_patient',
        action: pendingPatientDisambig.action,
        nameEn: fullName,
      };
      await repo.updateSessionContext(session.id, { ...restCtx, pendingPatientCreation: pendingCreation });
      const createPrompt = session.language === 'ar'
        ? `لم يُعثر على مريض باسم "${fullName}".\n\nهل تريد تسجيله كمريض جديد؟ أدخل رقم جواله لإتمام التسجيل.\n(أو اكتب "إلغاء" للرجوع)`
        : `No patient found with name "${fullName}".\n\nWould you like to register them as a new patient? Enter their mobile number to proceed.\n(Or type "cancel" to go back)`;
      await repo.saveMessage(session.id, 'assistant', createPrompt, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: createPrompt, action: null, language: session.language } });
      return;
    }

    if (candidates.length > 1) {
      const candidateList = candidates.map((c) => `• ${c.nameAr ?? c.nameEn}`).join('\n');
      await repo.updateSessionContext(session.id, { ...ctx, pendingPatientDisambig: { ...pendingPatientDisambig, candidates } });
      const tooMany = candidates.length >= 10;
      const stillAmbig = session.language === 'ar'
        ? (tooMany
            ? `الاسم شائع جداً. يرجى كتابة الاسم الثلاثي أو رباعي كاملاً، أو أدخل رقم جوال المريض للبحث المباشر.`
            : `لا يزال هناك أكثر من مريض بهذا الاسم:\n${candidateList}\n\nيرجى كتابة الاسم الكامل بدقة أكبر، أو أدخل رقم جوال المريض للبحث المباشر.`)
        : (tooMany
            ? `This name is very common. Please enter the full three- or four-part name, or enter the patient's mobile number to search directly.`
            : `Still multiple patients found:\n${candidateList}\n\nPlease enter the full name more precisely, or enter the patient's mobile number to search directly.`);
      await repo.saveMessage(session.id, 'assistant', stillAmbig, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: stillAmbig, action: null, language: session.language } });
      return;
    }

    // Unique match — proceed to fee collection (show full recap, same as normal path)
    const foundPatient = candidates[0];
    const { pendingPatientDisambig: _removed, ...restCtx } = ctx;
    const origAction = pendingPatientDisambig.action;
    const bookAction = { ...origAction, preResolvedPatient: foundPatient };
    const newPending: PendingBooking = { stage: 'awaiting_charge', action: bookAction };
    await repo.updateSessionContext(session.id, { ...restCtx, pendingBooking: newPending });

    const displayName = session.language === 'ar' ? (foundPatient.nameAr ?? foundPatient.nameEn) : foundPatient.nameEn;
    const paymentQ = session.language === 'ar'
      ? `تم تحديد المريض: ${displayName}\n\nتفاصيل الموعد:\n• المريض: ${displayName}\n• الطبيب: ${origAction.doctor}\n• التاريخ: ${origAction.date}\n• الوقت: ${origAction.time}\n\nكم تعرفة الجلسة؟ (أدخل المبلغ بالجنيه)`
      : `Patient confirmed: ${foundPatient.nameEn}\n\nAppointment details:\n• Patient: ${foundPatient.nameEn}\n• Doctor: ${origAction.doctor}\n• Date: ${origAction.date}\n• Time: ${origAction.time}\n\nWhat is the session fee? (enter amount in EGP)`;
    await repo.saveMessage(session.id, 'assistant', paymentQ, {});
    void reply.send({ success: true, data: { sessionId: session.id, reply: paymentQ, action: null, language: session.language } });
    return;
  }

  // ── Pending patient creation: collect mobile → register → resume booking ──
  const pendingPatientCreation = ctx.pendingPatientCreation as PendingPatientCreation | undefined;

  if (pendingPatientCreation?.stage === 'confirming_existing_patient') {
    const YES_RE = /^(yes|نعم|أيوه|ايوه|موافق|ok|okay|تأكيد|confirm|y|ي)$/i;
    const NO_RE  = /^(no|لا|لأ|cancel|إلغاء|الغاء|n)$/i;
    const conflictPatient = pendingPatientCreation.conflictPatient!;
    const conflictName = session.language === 'ar' ? (conflictPatient.nameAr ?? conflictPatient.nameEn) : conflictPatient.nameEn;

    if (YES_RE.test(input.message.trim())) {
      const { pendingPatientCreation: _removed, ...restCtx } = ctx;
      const origAction = pendingPatientCreation.action;
      const bookAction = { ...origAction, preResolvedPatient: conflictPatient };
      const newPending: PendingBooking = { stage: 'awaiting_charge', action: bookAction };
      await repo.updateSessionContext(session.id, { ...restCtx, pendingBooking: newPending });
      const paymentQ = session.language === 'ar'
        ? `تم تحديد المريض: ${conflictName}\n\nتفاصيل الموعد:\n• المريض: ${conflictName}\n• الطبيب: ${origAction.doctor}\n• التاريخ: ${origAction.date}\n• الوقت: ${origAction.time}\n\nكم تعرفة الجلسة؟ (أدخل المبلغ بالجنيه)`
        : `Patient confirmed: ${conflictPatient.nameEn}\n\nAppointment details:\n• Patient: ${conflictPatient.nameEn}\n• Doctor: ${origAction.doctor}\n• Date: ${origAction.date}\n• Time: ${origAction.time}\n\nWhat is the session fee? (enter amount in EGP)`;
      await repo.saveMessage(session.id, 'assistant', paymentQ, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: paymentQ, action: null, language: session.language } });
      return;
    }

    if (NO_RE.test(input.message.trim())) {
      const updatedCreation: PendingPatientCreation = {
        stage: 'awaiting_mobile_for_new_patient',
        action: pendingPatientCreation.action,
        nameEn: pendingPatientCreation.nameEn,
      };
      await repo.updateSessionContext(session.id, { ...ctx, pendingPatientCreation: updatedCreation });
      const askDiff = session.language === 'ar'
        ? 'يرجى إدخال رقم جوال مختلف للمريض الجديد.'
        : 'Please enter a different mobile number for the new patient.';
      await repo.saveMessage(session.id, 'assistant', askDiff, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: askDiff, action: null, language: session.language } });
      return;
    }

    // Unclear answer — ask again
    const clarify = session.language === 'ar'
      ? `يرجى الرد بـ "نعم" لحجز الموعد للمريض "${conflictName}" أو "لا" لإدخال رقم جوال مختلف.`
      : `Please reply "yes" to book for patient "${conflictPatient.nameEn}" or "no" to enter a different mobile number.`;
    await repo.saveMessage(session.id, 'assistant', clarify, {});
    void reply.send({ success: true, data: { sessionId: session.id, reply: clarify, action: null, language: session.language } });
    return;
  }

  if (pendingPatientCreation?.stage === 'awaiting_mobile_for_new_patient') {
    const rawInput = input.message.trim();
    const CANCEL_RE = /^(إلغاء|الغاء|cancel|exit|quit|stop|خروج|back|رجوع)$/i;

    if (CANCEL_RE.test(rawInput)) {
      const { pendingPatientCreation: _removed, ...restCtx } = ctx;
      await repo.updateSessionContext(session.id, restCtx);
      const cancelMsg = session.language === 'ar'
        ? 'تم إلغاء التسجيل. كيف يمكنني مساعدتك؟'
        : 'Registration cancelled. How can I help you?';
      await repo.saveMessage(session.id, 'assistant', cancelMsg, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: cancelMsg, action: null, language: session.language } });
      return;
    }

    const mobile = normalizeMobile(rawInput.replace(/[\s\-]/g, ''));
    if (!/^\+20\d{10}$/.test(mobile)) {
      const retry = session.language === 'ar'
        ? 'رقم الجوال غير صحيح. يرجى إدخال رقم مصري صحيح (مثال: 01012345678).'
        : 'Invalid mobile number. Please enter a valid Egyptian number (e.g., 01012345678).';
      await repo.saveMessage(session.id, 'assistant', retry, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: retry, action: null, language: session.language } });
      return;
    }

    const createHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
    const regRes = await fetch(`${config.PATIENT_SERVICE_URL}/patients`, {
      method: 'POST',
      headers: createHeaders,
      body: JSON.stringify({
        nameEn: pendingPatientCreation.nameEn,
        mobile,
        sourceFirstVisit: "Cl.'s",
      }),
    });

    if (regRes.ok) {
      const regData = await regRes.json() as { data?: { patientId?: string; id?: string; nameEn: string; nameAr?: string } };
      const raw = regData.data!;
      const newPatient: PatientCandidate = {
        patientId: raw.patientId ?? raw.id ?? '',
        nameEn: raw.nameEn,
        nameAr: raw.nameAr,
      };
      const { pendingPatientCreation: _removed, ...restCtx } = ctx;
      const origAction = pendingPatientCreation.action;
      const bookAction = { ...origAction, preResolvedPatient: newPatient };
      const newPending: PendingBooking = { stage: 'awaiting_charge', action: bookAction };
      await repo.updateSessionContext(session.id, { ...restCtx, pendingBooking: newPending });
      const displayName = session.language === 'ar' ? (newPatient.nameAr ?? newPatient.nameEn) : newPatient.nameEn;
      const paymentQ = session.language === 'ar'
        ? `✅ تم تسجيل المريض "${displayName}" بنجاح!\n\nتفاصيل الموعد:\n• المريض: ${displayName}\n• الطبيب: ${origAction.doctor}\n• التاريخ: ${origAction.date}\n• الوقت: ${origAction.time}\n\nكم تعرفة الجلسة؟ (أدخل المبلغ بالجنيه)`
        : `✅ Patient "${newPatient.nameEn}" registered successfully!\n\nAppointment details:\n• Patient: ${newPatient.nameEn}\n• Doctor: ${origAction.doctor}\n• Date: ${origAction.date}\n• Time: ${origAction.time}\n\nWhat is the session fee? (enter amount in EGP)`;
      await repo.saveMessage(session.id, 'assistant', paymentQ, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: paymentQ, action: null, language: session.language } });
      return;
    }

    const regErrData = await regRes.json() as { error?: { code?: string; message?: string } };
    if (regRes.status === 409 && regErrData.error?.code === 'MOBILE_ALREADY_EXISTS') {
      const mobileSearchRes = await fetch(
        `${config.PATIENT_SERVICE_URL}/patients?mobile=${encodeURIComponent(mobile)}&limit=1`,
        { headers: createHeaders },
      );
      if (mobileSearchRes.ok) {
        const mobileData = await mobileSearchRes.json() as { data?: PatientCandidate[] };
        const existingPatient = mobileData.data?.[0];
        if (existingPatient) {
          const existingName = session.language === 'ar' ? (existingPatient.nameAr ?? existingPatient.nameEn) : existingPatient.nameEn;
          const updatedCreation: PendingPatientCreation = {
            stage: 'confirming_existing_patient',
            action: pendingPatientCreation.action,
            nameEn: pendingPatientCreation.nameEn,
            conflictPatient: existingPatient,
          };
          await repo.updateSessionContext(session.id, { ...ctx, pendingPatientCreation: updatedCreation });
          const conflictMsg = session.language === 'ar'
            ? `رقم الجوال ${mobile} مسجل بالفعل للمريض "${existingName}".\nهل تريد حجز الموعد لهذا المريض؟ (نعم / لا — أو أدخل رقماً مختلفاً)`
            : `Mobile ${mobile} is already registered to patient "${existingPatient.nameEn}".\nBook for this patient instead? (yes / no — or enter a different mobile)`;
          await repo.saveMessage(session.id, 'assistant', conflictMsg, {});
          void reply.send({ success: true, data: { sessionId: session.id, reply: conflictMsg, action: null, language: session.language } });
          return;
        }
      }
    }

    const errMsg = regErrData.error?.message ?? (session.language === 'ar' ? 'خطأ غير معروف' : 'Unknown error');
    const errReply = session.language === 'ar'
      ? `فشل تسجيل المريض: ${errMsg}. يرجى المحاولة مرة أخرى أو اكتب "إلغاء".`
      : `Patient registration failed: ${errMsg}. Please try again or type "cancel".`;
    await repo.saveMessage(session.id, 'assistant', errReply, {});
    void reply.send({ success: true, data: { sessionId: session.id, reply: errReply, action: null, language: session.language } });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const pendingDoctorSearch = ctx.pendingDoctorSearch as PendingDoctorSearch | undefined;

  if (pendingDoctorSearch?.stage === 'awaiting_specialty') {
    const specialtyId = resolveSpecialtyId(input.message);

    if (!specialtyId) {
      const specialtyList = Object.entries(SPECIALTY_NAMES)
        .map(([id, n]) => `${id}: ${session.language === 'ar' ? n.ar : n.en}`)
        .join(session.language === 'ar' ? '، ' : ', ');
      const clarify = session.language === 'ar'
        ? `لم أتمكن من التعرف على التخصص. يرجى اختيار تخصص من القائمة:\n${specialtyList}`
        : `Could not recognise that specialty. Please choose from:\n${specialtyList}`;
      await repo.saveMessage(session.id, 'assistant', clarify, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: clarify, action: null, language: session.language } });
      return;
    }

    const { pendingDoctorSearch: _removed, ...restCtx } = ctx;
    await repo.updateSessionContext(session.id, restCtx);

    const result = await fetchDoctorsBySpecialty(specialtyId, authToken, session.language);
    const actionResult = { action: 'list_doctors', specialtyId, result: 'executed' };
    await repo.saveMessage(session.id, 'assistant', result, { action: actionResult });
    void reply.send({ success: true, data: { sessionId: session.id, reply: result, action: actionResult, language: session.language } });
    return;
  }

  // ── Pending booking: multi-turn fee + payment + extras collection ────────
  const pending = ctx.pendingBooking as PendingBooking | undefined;

  if (pending?.stage === 'awaiting_charge') {
    if (!['admin', 'receptionist'].includes(user.role)) {
      const { pendingBooking: _removed, ...restCtx } = ctx;
      await repo.updateSessionContext(session.id, restCtx);
      const denied = session.language === 'ar'
        ? 'عذراً، حجز المواعيد مقتصر على موظفي الاستقبال والمسؤولين.'
        : 'Sorry, booking appointments is restricted to receptionists and admins.';
      await repo.saveMessage(session.id, 'assistant', denied, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: denied, action: null, language: session.language } });
      return;
    }
    const charge = normalizeNumericInput(input.message);
    if (charge === null) {
      const retry = session.language === 'ar'
        ? 'يرجى إدخال مبلغ صحيح. مثال: 200'
        : 'Please enter a valid amount. Example: 200';
      await repo.saveMessage(session.id, 'assistant', retry, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: retry, action: null, language: session.language } });
      return;
    }
    const updatedAfterCharge: PendingBooking = { ...pending, stage: 'awaiting_payment', charge };
    await repo.updateSessionContext(session.id, { ...ctx, pendingBooking: updatedAfterCharge });
    const paymentQ = session.language === 'ar'
      ? `التعرفة: ${charge} ج.م ✓\n\nما طريقة الدفع المفضلة؟\n💵 نقداً | 💳 بطاقة (Visa) | 📱 انستاباي`
      : `Fee: ${charge} EGP ✓\n\nWhat is the preferred payment method?\n💵 Cash | 💳 Card (Visa) | 📱 InstaPay`;
    await repo.saveMessage(session.id, 'assistant', paymentQ, {});
    void reply.send({ success: true, data: { sessionId: session.id, reply: paymentQ, action: null, language: session.language } });
    return;
  }

  if (pending?.stage === 'awaiting_payment') {
    if (!['admin', 'receptionist'].includes(user.role)) {
      const { pendingBooking: _removed, ...restCtx } = ctx;
      await repo.updateSessionContext(session.id, restCtx);
      const denied = session.language === 'ar'
        ? 'عذراً، حجز المواعيد مقتصر على موظفي الاستقبال والمسؤولين.'
        : 'Sorry, booking appointments is restricted to receptionists and admins.';
      await repo.saveMessage(session.id, 'assistant', denied, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: denied, action: null, language: session.language } });
      return;
    }
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
    if (!['admin', 'receptionist'].includes(user.role)) {
      const { pendingBooking: _removed, ...restCtx } = ctx;
      await repo.updateSessionContext(session.id, restCtx);
      const denied = session.language === 'ar'
        ? 'عذراً، حجز المواعيد مقتصر على موظفي الاستقبال والمسؤولين.'
        : 'Sorry, booking appointments is restricted to receptionists and admins.';
      await repo.saveMessage(session.id, 'assistant', denied, {});
      void reply.send({ success: true, data: { sessionId: session.id, reply: denied, action: null, language: session.language } });
      return;
    }
    const noPattern = /^(لا|لأ|no|none|nothing|لا\s*شيء|لاشيء)$/i;
    const hasExtras = !noPattern.test(input.message.trim());
    const notes = hasExtras ? input.message.trim() : undefined;

    const bookAction = {
      ...pending.action,
      ...(pending.charge !== undefined ? { approvedCharge: pending.charge } : {}),
      paymentMethod: pending.paymentMethod,
      ...(notes ? { notes } : {}),
    };
    const { pendingBooking: _removed, ...restCtx } = ctx;
    await repo.updateSessionContext(session.id, restCtx);

    const executionResult = await executeAction(bookAction, authToken, session.language);
    const finalReply = executionResult ?? (session.language === 'ar' ? 'حدث خطأ أثناء الحجز.' : 'Booking error.');

    const actionResult = { ...bookAction, result: 'executed' };
    // Strip PII (preResolvedPatient, notes) from the long-lived lastAction context entry
    const { preResolvedPatient: _p, notes: _n, ...auditAction } = bookAction as Record<string, unknown>;
    await repo.saveMessage(session.id, 'assistant', finalReply, { action: actionResult });
    await repo.updateSessionContext(session.id, { ...restCtx, lastAction: { ...auditAction, result: 'executed' } });

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

  if (action && ['book_appointment', 'get_appointments', 'register_patient', 'register_doctor', 'ask_specialty', 'list_doctors'].includes(String(action.action))) {
    // Role guard: only admin and receptionist may book appointments
    if (action.action === 'book_appointment' && !['admin', 'receptionist'].includes(user.role)) {
      finalReply = session.language === 'ar'
        ? 'عذراً، حجز المواعيد مقتصر على موظفي الاستقبال والمسؤولين.'
        : 'Sorry, booking appointments is restricted to receptionists and admins.';
      actionResult = { ...action, result: 'permission_denied' };
    } else if (action.action === 'book_appointment') {
      // Resolve patient upfront so we catch ambiguity before asking for payment
      const patientName = String(action.patient ?? '').trim();
      if (!patientName) {
        finalReply = session.language === 'ar'
          ? 'يرجى تحديد اسم المريض لإتمام الحجز.'
          : 'Please provide a patient name to complete the booking.';
        actionResult = { ...action, result: 'missing_patient_name' };
      } else {
      const upfrontHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      };
      const upfrontPatRes = await fetch(
        `${config.PATIENT_SERVICE_URL}/patients?query=${encodeURIComponent(patientName)}&limit=10`,
        { headers: upfrontHeaders },
      );

      if (!upfrontPatRes.ok) {
        finalReply = session.language === 'ar'
          ? `تعذّر البحث عن المريض "${patientName}". يرجى التحقق من الاسم.`
          : `Could not search for patient "${patientName}". Please check the name.`;
        actionResult = { ...action, result: 'patient_search_failed' };
      } else {
        const upfrontPatData = await upfrontPatRes.json() as { data?: PatientCandidate[] };
        const upfrontCandidates = upfrontPatData.data ?? [];

        if (upfrontCandidates.length === 0) {
          // No patient found — offer to create inline
          const pendingCreation: PendingPatientCreation = {
            stage: 'awaiting_mobile_for_new_patient',
            action: { ...action },
            nameEn: patientName,
          };
          await repo.updateSessionContext(session.id, { ...ctx, pendingPatientCreation: pendingCreation });
          finalReply = session.language === 'ar'
            ? `لم يُعثر على مريض باسم "${patientName}" في النظام.\n\nهل تريد تسجيله الآن؟ أدخل رقم جواله (مثال: 01012345678) لإتمام التسجيل والمتابعة مع الحجز.\n(أو اكتب "إلغاء" للرجوع)`
            : `No patient found with name "${patientName}" in the system.\n\nWould you like to register them now? Enter their mobile number (e.g., 01012345678) to complete registration and continue with the booking.\n(Or type "cancel" to go back)`;
          actionResult = { ...action, result: 'awaiting_patient_creation' };
        } else if (upfrontCandidates.length > 1) {
          // Ambiguous — save disambiguation state and ask for full name
          const candidateList = upfrontCandidates.map((c) => `• ${c.nameAr ?? c.nameEn}`).join('\n');
          const pendingDisambig: PendingPatientDisambiguation = {
            stage: 'awaiting_patient_full_name',
            action: { ...action },
            candidates: upfrontCandidates,
          };
          await repo.updateSessionContext(session.id, { ...ctx, pendingPatientDisambig: pendingDisambig });
          finalReply = session.language === 'ar'
            ? `وُجد أكثر من مريض باسم "${patientName}":\n${candidateList}\n\nيرجى كتابة الاسم الكامل (الاسم الأول والأخير) لتحديد المريض بدقة.`
            : `Multiple patients found with the name "${patientName}":\n${candidateList}\n\nPlease enter the full name (first and last name) to identify the correct patient.`;
          actionResult = { ...action, result: 'awaiting_patient_disambiguation' };
        } else {
          // Unique match — proceed to fee collection
          const foundPatient = upfrontCandidates[0];
          const bookAction = { ...action, preResolvedPatient: foundPatient };
          const pendingBooking: PendingBooking = { stage: 'awaiting_charge', action: bookAction };
          await repo.updateSessionContext(session.id, { ...ctx, pendingBooking });
          const displayName = session.language === 'ar' ? (foundPatient.nameAr ?? foundPatient.nameEn) : foundPatient.nameEn;
          finalReply = session.language === 'ar'
            ? `رائع! تفاصيل الموعد:\n• المريض: ${displayName}\n• الطبيب: ${action.doctor}\n• التاريخ: ${action.date}\n• الوقت: ${action.time}\n\nكم تعرفة الجلسة؟ (أدخل المبلغ بالجنيه)`
            : `Great! Appointment details:\n• Patient: ${foundPatient.nameEn}\n• Doctor: ${action.doctor}\n• Date: ${action.date}\n• Time: ${action.time}\n\nWhat is the session fee? (enter amount in EGP)`;
          actionResult = { ...action, result: 'awaiting_charge' };
        }
      }
      } // end else (patientName non-empty)
    } else if (action.action === 'ask_specialty') {
      // Save pending state and ask user to choose specialty
      const pendingSearch: PendingDoctorSearch = { stage: 'awaiting_specialty' };
      await repo.updateSessionContext(session.id, { ...ctx, pendingDoctorSearch: pendingSearch });

      const specialtyList = Object.entries(SPECIALTY_NAMES)
        .map(([id, n]) => `${id}: ${session.language === 'ar' ? n.ar : n.en}`)
        .join('\n');
      finalReply = session.language === 'ar'
        ? `ما التخصص الذي تبحث عنه؟\n\nالتخصصات المتاحة:\n${specialtyList}`
        : `Which specialty are you looking for?\n\nAvailable specialties:\n${specialtyList}`;
      actionResult = { action: 'ask_specialty', result: 'awaiting_specialty' };
    } else if (action.action === 'list_doctors') {
      const specId = Number(action.specialtyId ?? 0);
      if (!specId || !SPECIALTY_NAMES[specId]) {
        // specialtyId missing or unknown — fall back to asking
        const pendingSearch: PendingDoctorSearch = { stage: 'awaiting_specialty' };
        await repo.updateSessionContext(session.id, { ...ctx, pendingDoctorSearch: pendingSearch });
        const specialtyList = Object.entries(SPECIALTY_NAMES)
          .map(([id, n]) => `${id}: ${session.language === 'ar' ? n.ar : n.en}`)
          .join('\n');
        finalReply = session.language === 'ar'
          ? `ما التخصص الذي تبحث عنه؟\n\nالتخصصات المتاحة:\n${specialtyList}`
          : `Which specialty are you looking for?\n\nAvailable specialties:\n${specialtyList}`;
        actionResult = { action: 'ask_specialty', result: 'awaiting_specialty' };
      } else {
        finalReply = await fetchDoctorsBySpecialty(specId, authToken, session.language);
        actionResult = { ...action, result: 'executed' };
      }
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
