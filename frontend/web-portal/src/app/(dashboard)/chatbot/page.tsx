'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { Send, Bot, User, Globe, CheckCircle, Loader2, X, CalendarDays } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useModuleEnabled } from '@/hooks/useFeatureFlags';
import { ModuleUnavailablePage } from '@/components/shared/ModuleUnavailablePage';
import { chatbotApi, patientApi, appointmentApi } from '@/lib/api';
import { useDoctors, useSpecialties } from '@/hooks/useDoctors';
import { cn } from '@/lib/utils';
import type { Specialty, Doctor, Patient } from '@fadl/types';

// ─── Types ─────────────────────────────────────────────────────────────────

type Step =
  | 'idle'
  | 'get_patient'
  | 'get_specialty'
  | 'get_doctor'
  | 'get_date'
  | 'get_time'
  | 'get_fee'
  | 'get_payment'
  | 'confirm'
  | 'done'
  | 'chat';

interface Suggestion {
  label: string;
  icon?: string;
  value: string;
  payload?: Record<string, unknown>;
}

interface ConfirmCard {
  patientName: string;
  doctorName: string;
  dateLabel: string;
  time: string;
  charge: string;
  paymentMethod: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestions?: Suggestion[];
  confirmCard?: ConfirmCard;
}

interface BookingState {
  step: Step;
  patientName: string;
  specialtyId: number | null;
  specialtyName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  dateLabel: string;
  time: string;
  charge: string;
  paymentMethod: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SPECIALTY_EMOJIS: Record<string, string> = {
  gynecology:         '🤰',
  cardiology:         '❤️',
  dermatology:        '🔬',
  pediatrics:         '👶',
  'internal medicine':'🩺',
  orthopedics:        '🦴',
  ent:                '👂',
  ophthalmology:      '👁️',
  'general surgery':  '🔪',
  dentistry:          '🦷',
  neurology:          '🧠',
  psychiatry:         '🧘',
  oncology:           '🎗️',
  urology:            '💊',
  endocrinology:      '⚗️',
  nutrition:          '🥗',
};

function specialtyEmoji(nameEn: string): string {
  const lower = nameEn.toLowerCase();
  for (const [key, emoji] of Object.entries(SPECIALTY_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return '🏥';
}

const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

function formatTimeLabel(time: string, locale: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function getNextSevenDays(locale: string): { value: string; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: d.toISOString().split('T')[0],
      label: d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
    };
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function addMinutesStr(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function makeBot(text: string, suggestions?: Suggestion[], confirmCard?: ConfirmCard): Message {
  return { id: uid(), role: 'assistant', text, suggestions, confirmCard };
}

function getSessionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem('fadl_chat_session') ?? undefined;
}

function normalizeNumericInput(s: string): number | null {
  const normalized = s.trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  const n = parseFloat(normalized);
  return isFinite(n) && n >= 0 ? n : null;
}

const PAYMENT_OPTIONS = [
  { label: '💵 نقداً / Cash',    value: 'cash',     icon: '💵' },
  { label: '💳 بطاقة / Visa',    value: 'visa',     icon: '💳' },
  { label: '📱 انستاباي / InstaPay', value: 'instapay', icon: '📱' },
];

function paymentLabel(method: string, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return method === 'visa' ? 'بطاقة ائتمانية' : method === 'instapay' ? 'انستاباي' : 'نقداً';
  }
  return method === 'visa' ? 'Card (Visa)' : method === 'instapay' ? 'InstaPay' : 'Cash';
}

const INITIAL_BOOKING: BookingState = {
  step: 'idle', patientName: '', specialtyId: null, specialtyName: '',
  doctorId: '', doctorName: '', date: '', dateLabel: '', time: '',
  charge: '', paymentMethod: '',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SuggestionPills({ suggestions, onSelect, disabled }: {
  suggestions: Suggestion[];
  onSelect: (s: Suggestion) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((s) => (
        <button
          key={s.value}
          onClick={() => !disabled && onSelect(s)}
          disabled={disabled}
          className={cn(
            'px-4 py-2 rounded-full border text-sm font-medium transition-all duration-150',
            'flex items-center gap-1.5 cursor-pointer',
            disabled
              ? 'border-gray-200 text-gray-400 cursor-not-allowed dark:border-neutral-700 dark:text-gray-600'
              : [
                  'border-primary-600 text-primary-600',
                  'hover:bg-primary-600 hover:text-white',
                  'dark:border-primary-400 dark:text-primary-400',
                  'dark:hover:bg-primary-600 dark:hover:text-white dark:hover:border-primary-600',
                ],
          )}
        >
          {s.icon && <span>{s.icon}</span>}
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ConfirmCardWidget({ card, lang, onConfirm, onCancel, loading }: {
  card: ConfirmCard;
  lang: 'ar' | 'en';
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const tl = (ar: string, en: string) => lang === 'ar' ? ar : en;
  return (
    <div className="mt-2 border border-primary-100 dark:border-primary-800/50 rounded-2xl overflow-hidden shadow-sm w-full">
      <div className="bg-primary-50 dark:bg-primary-900/20 px-4 py-2.5 border-b border-primary-100 dark:border-primary-800/40">
        <p className="text-sm font-semibold text-primary-800 dark:text-primary-300 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          {tl('تأكيد الحجز', 'Booking Confirmation')}
        </p>
      </div>
      <div className="p-4 space-y-2.5 bg-white dark:bg-neutral-800/60 text-sm">
        {[
          { icon: '👤', label: tl('المريض', 'Patient'),  value: card.patientName },
          { icon: '👨‍⚕️', label: tl('الطبيب', 'Doctor'),   value: card.doctorName },
          { icon: '📅', label: tl('التاريخ', 'Date'),    value: card.dateLabel },
          { icon: '🕒', label: tl('الوقت', 'Time'),     value: card.time },
          { icon: '💰', label: tl('التعرفة', 'Fee'),     value: card.charge ? `${card.charge} ${tl('ج.م', 'EGP')}` : tl('—', '—') },
          { icon: '💳', label: tl('الدفع', 'Payment'),  value: card.paymentMethod ? paymentLabel(card.paymentMethod, lang) : tl('—', '—') },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2.5">
            <span className="text-base w-6 flex-shrink-0">{row.icon}</span>
            <span className="text-gray-500 dark:text-gray-400 min-w-[4rem]">{row.label}:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-3 bg-gray-50 dark:bg-neutral-800/80 border-t border-gray-100 dark:border-neutral-700">
        <Button className="flex-1 h-9 text-sm gap-1.5" onClick={onConfirm} loading={loading}>
          <CheckCircle className="w-4 h-4" />
          {tl('✅ تأكيد الحجز', '✅ Confirm')}
        </Button>
        <Button variant="outline" className="h-9 px-3 text-sm" onClick={onCancel} disabled={loading}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const aiEnabled = useModuleEnabled('ai');
  const { lang, t, toggle } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const { data: specialtiesData } = useSpecialties();
  const { data: doctorsData }     = useDoctors({ isActive: true, limit: 200 });
  const specialties: Specialty[]  = specialtiesData ?? [];
  const allDoctors: Doctor[]      = doctorsData?.data ?? [];

  const quickActions: Suggestion[] = [
    { label: t('📅 حجز موعد جديد', '📅 Book Appointment'), value: '__book__' },
    { label: t('👨‍⚕️ استعلام عن طبيب', '👨‍⚕️ Ask About Doctors'), value: t('أريد معلومات عن الأطباء المتاحين', 'Tell me about available doctors') },
    { label: t('📋 مواعيد اليوم', '📋 Today\'s Schedule'), value: '__today__' },
    { label: t('💊 نصيحة طبية', '💊 Medical Advice'), value: t('أحتاج نصيحة طبية', 'I need medical advice') },
  ];

  const welcomeMsg = makeBot(
    t(
      'مرحباً! أنا المساعد الذكي لعيادة فضل كلينك 👋\nاختر من الخيارات التالية أو اكتب سؤالك مباشرة:',
      'Hello! I\'m the Fadl Clinic AI Assistant 👋\nChoose from the options below or type your question:',
    ),
    quickActions,
  );

  const [messages, setMessages]       = useState<Message[]>([welcomeMsg]);
  const [booking, setBooking]         = useState<BookingState>(INITIAL_BOOKING);
  const [input, setInput]             = useState('');
  const [llmLoading, setLlmLoading]   = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Message helpers ───────────────────────────────────────────────────────

  function addBot(text: string, suggestions?: Suggestion[], confirmCard?: ConfirmCard) {
    setMessages((prev) => [...prev, makeBot(text, suggestions, confirmCard)]);
  }

  function addUser(text: string) {
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text }]);
  }

  // ── LLM ──────────────────────────────────────────────────────────────────

  async function sendToLlm(text: string, showQuickActionsAfter = true) {
    setLlmLoading(true);
    try {
      const { data } = await chatbotApi.post<{ data: { reply: string; sessionId?: string } }>('/chat/message', {
        message: text, language: lang, sessionId: getSessionId(),
      });
      const r = data.data;
      if (r.sessionId) localStorage.setItem('fadl_chat_session', r.sessionId);
      addBot(r.reply, showQuickActionsAfter ? quickActions : undefined);
    } catch {
      addBot(t('عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.', 'Sorry, an error occurred. Please try again.'));
    } finally {
      setLlmLoading(false);
    }
  }

  // ── Booking steps ─────────────────────────────────────────────────────────

  function startBookingFlow() {
    setBooking({ ...INITIAL_BOOKING, step: 'get_patient' });
    addBot(t('ما اسم المريض؟\nاكتبه في مربع الرسائل أدناه 👇', 'What is the patient\'s name?\nType it in the message box below 👇'));
  }

  function handlePatientName(name: string) {
    setBooking((b) => ({ ...b, patientName: name, step: 'get_specialty' }));
    const pills: Suggestion[] = specialties.map((s) => ({
      label:   lang === 'ar' ? s.nameAr : s.nameEn,
      icon:    specialtyEmoji(s.nameEn),
      value:   String(s.id),
      payload: { id: s.id, nameAr: s.nameAr, nameEn: s.nameEn },
    }));
    addBot(t('اختر التخصص الطبي المطلوب:', 'Choose the required specialty:'), pills);
  }

  function handleSpecialtyPick(s: Suggestion) {
    const id    = Number(s.value);
    const name  = lang === 'ar'
      ? String((s.payload as { nameAr?: string })?.nameAr ?? s.label)
      : s.label;
    setBooking((b) => ({ ...b, specialtyId: id, specialtyName: name, step: 'get_doctor' }));

    const doctors = allDoctors.filter((d) => d.specialtyId === id);
    if (doctors.length === 0) {
      addBot(t(
        'لا يوجد أطباء متاحون لهذا التخصص حالياً.',
        'No doctors available for this specialty currently.',
      ), quickActions);
      setBooking(INITIAL_BOOKING);
      return;
    }
    const pills: Suggestion[] = doctors.map((d) => ({
      label:   lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn,
      icon:    '👨‍⚕️',
      value:   d.id,
      payload: { nameAr: d.nameAr, nameEn: d.nameEn },
    }));
    addBot(t('اختر الطبيب:', 'Choose the doctor:'), pills);
  }

  function handleDoctorPick(s: Suggestion) {
    const name = lang === 'ar'
      ? String((s.payload as { nameAr?: string })?.nameAr ?? s.label)
      : s.label;
    setBooking((b) => ({ ...b, doctorId: s.value, doctorName: name, step: 'get_date' }));

    const days   = getNextSevenDays(locale);
    const pills: Suggestion[] = days.map((d, i) => ({
      label:   i === 0 ? t(`اليوم - ${d.label}`, `Today - ${d.label}`) : d.label,
      icon:    i === 0 ? '📅' : '📆',
      value:   d.value,
      payload: { label: i === 0 ? (lang === 'ar' ? `اليوم - ${d.label}` : `Today - ${d.label}`) : d.label },
    }));
    addBot(t('اختر التاريخ:', 'Choose the date:'), pills);
  }

  function handleDatePick(s: Suggestion) {
    const label = String((s.payload as { label?: string })?.label ?? s.label);
    setBooking((b) => ({ ...b, date: s.value, dateLabel: label, step: 'get_time' }));

    const pills: Suggestion[] = TIME_SLOTS.map((time) => ({
      label: formatTimeLabel(time, locale),
      icon:  parseInt(time.split(':')[0]) < 12 ? '🌅' : '🌇',
      value: time,
    }));
    addBot(t('اختر الوقت المناسب:', 'Choose a suitable time:'), pills);
  }

  function handleTimePick(s: Suggestion) {
    setBooking((b) => ({ ...b, time: s.value, step: 'get_fee' }));
    addBot(t('كم تعرفة الجلسة؟ (أدخل المبلغ بالجنيه)', 'What is the session fee? (enter amount in EGP)'));
  }

  function handleFeeEntry(feeStr: string) {
    const fee = normalizeNumericInput(feeStr);
    if (fee === null) {
      addBot(t('يرجى إدخال مبلغ صحيح. مثال: 200', 'Please enter a valid amount. Example: 200'));
      return;
    }
    setBooking((b) => ({ ...b, charge: String(fee), step: 'get_payment' }));
    const pills: Suggestion[] = PAYMENT_OPTIONS.map((p) => ({
      label: lang === 'ar' ? (p.value === 'cash' ? '💵 نقداً' : p.value === 'visa' ? '💳 بطاقة (Visa)' : '📱 انستاباي')
                           : (p.value === 'cash' ? '💵 Cash' : p.value === 'visa' ? '💳 Card (Visa)' : '📱 InstaPay'),
      icon:  p.icon,
      value: p.value,
    }));
    addBot(
      t(`التعرفة: ${fee} ج.م ✓\n\nما طريقة الدفع المفضلة؟`, `Fee: ${fee} EGP ✓\n\nWhat is the preferred payment method?`),
      pills,
    );
  }

  function handlePaymentPick(s: Suggestion, currentBooking: BookingState) {
    const method = s.value;
    setBooking((b) => ({ ...b, paymentMethod: method, step: 'confirm' }));
    const timeLabel = formatTimeLabel(currentBooking.time, locale);
    const card: ConfirmCard = {
      patientName:   currentBooking.patientName,
      doctorName:    currentBooking.doctorName,
      dateLabel:     currentBooking.dateLabel,
      time:          timeLabel,
      charge:        currentBooking.charge,
      paymentMethod: method,
    };
    addBot(t('راجع تفاصيل الحجز وأكّد:', 'Review the booking details and confirm:'), undefined, card);
  }

  async function handleConfirm(currentBooking: BookingState) {
    setConfirmLoading(true);
    try {
      // Resolve patient by name
      const patRes = await patientApi.get<{ data?: Patient[] }>('/patients', {
        params: { query: currentBooking.patientName, limit: 1 },
      });
      const patient = patRes.data.data?.[0];
      if (!patient) {
        addBot(t(
          `لم يُعثر على مريض باسم "${currentBooking.patientName}". تحقق من الاسم أو سجّله أولاً.`,
          `No patient found with name "${currentBooking.patientName}". Please verify or register first.`,
        ));
        setBooking(INITIAL_BOOKING);
        return;
      }

      const chargeNum = currentBooking.charge ? parseFloat(currentBooking.charge) : undefined;
      const { data } = await appointmentApi.post<{ data: { id: string } }>('/appointments', {
        patientId:       patient.patientId,
        doctorId:        currentBooking.doctorId,
        appointmentDate: currentBooking.date,
        startTime:       currentBooking.time,
        endTime:         addMinutesStr(currentBooking.time, 30),
        appointmentType: 'in_person',
        patientSource:   "Cl.'s",
        specialtyId:     currentBooking.specialtyId,
        idempotencyKey:  `chat-${Date.now()}-${uid()}`,
        ...(chargeNum !== undefined && chargeNum > 0 ? { approvedCharge: chargeNum } : {}),
        ...(currentBooking.paymentMethod ? { paymentMethod: currentBooking.paymentMethod } : {}),
      });

      const apptId = data.data?.id?.slice(-8).toUpperCase() ?? '';
      setBooking((b) => ({ ...b, step: 'done' }));
      addBot(
        t(
          `✅ تم الحجز بنجاح!\n\n👤 ${patient.nameAr ?? patient.nameEn}\n👨‍⚕️ ${currentBooking.doctorName}\n📅 ${currentBooking.dateLabel}\n🕒 ${currentBooking.time}\n🔖 رقم الموعد: ${apptId}`,
          `✅ Appointment booked!\n\n👤 ${patient.nameEn}\n👨‍⚕️ ${currentBooking.doctorName}\n📅 ${currentBooking.dateLabel}\n🕒 ${currentBooking.time}\n🔖 ID: ${apptId}`,
        ),
        [
          { label: t('📅 حجز موعد آخر', '📅 Book Another'), value: '__book__' },
          ...quickActions.slice(1),
        ],
      );
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { code?: string } } } };
      if (apiErr.response?.data?.error?.code === 'DOUBLE_BOOKING') {
        addBot(t(
          'هذا الوقت محجوز بالفعل للطبيب. اختر وقتاً آخر:',
          'This slot is already booked. Choose another time:',
        ), TIME_SLOTS.map((time) => ({
          label: formatTimeLabel(time, locale),
          icon:  parseInt(time.split(':')[0]) < 12 ? '🌅' : '🌇',
          value: time,
        })));
        setBooking((b) => ({ ...b, step: 'get_time' }));
      } else {
        addBot(t(
          'حدث خطأ أثناء الحجز. يرجى المحاولة مرة أخرى.',
          'Booking failed. Please try again.',
        ));
      }
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleCancelBooking() {
    setBooking(INITIAL_BOOKING);
    addBot(t('تم إلغاء الحجز.', 'Booking cancelled.'), quickActions);
  }

  async function handleTodayAppts() {
    setLlmLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await appointmentApi.get<{ data?: { startTime: string; status: string }[] }>('/appointments', {
        params: { date: today, limit: 20 },
      });
      const appts = data.data ?? [];
      addBot(
        appts.length === 0
          ? t('لا توجد مواعيد اليوم.', 'No appointments today.')
          : t(
              `مواعيد اليوم (${appts.length}):\n${appts.map((a) => `• ${a.startTime}: ${a.status}`).join('\n')}`,
              `Today's appointments (${appts.length}):\n${appts.map((a) => `• ${a.startTime}: ${a.status}`).join('\n')}`,
            ),
        quickActions,
      );
    } catch {
      addBot(t('تعذّر تحميل المواعيد.', 'Failed to load appointments.'), quickActions);
    } finally {
      setLlmLoading(false);
    }
  }

  // ── Suggestion dispatcher ─────────────────────────────────────────────────

  function handleSuggestion(s: Suggestion) {
    if (s.value === '__book__')  { addUser(t('حجز موعد جديد', 'Book New Appointment')); startBookingFlow(); return; }
    if (s.value === '__today__') { addUser(t('عرض مواعيد اليوم', 'Show today\'s appointments')); void handleTodayAppts(); return; }

    addUser(s.label);

    const step = booking.step;
    if (step === 'get_specialty') { handleSpecialtyPick(s); return; }
    if (step === 'get_doctor')    { handleDoctorPick(s); return; }
    if (step === 'get_date')      { handleDatePick(s); return; }
    if (step === 'get_time')      { handleTimePick(s); return; }
    if (step === 'get_payment')   { handlePaymentPick(s, booking); return; }

    setBooking((b) => ({ ...b, step: 'chat' }));
    void sendToLlm(s.value);
  }

  // ── Text input ────────────────────────────────────────────────────────────

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || llmLoading) return;

    addUser(text);
    setInput('');

    const step = booking.step;

    if (step === 'get_patient') { handlePatientName(text); return; }
    if (step === 'get_fee')     { handleFeeEntry(text); return; }

    if (step === 'idle' || step === 'done' || step === 'chat') {
      setBooking((b) => ({ ...b, step: 'chat' }));
      void sendToLlm(text);
      return;
    }

    // Typed text during a pick step → LLM handles it
    void sendToLlm(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = llmLoading || confirmLoading;

  if (!aiEnabled) return <ModuleUnavailablePage moduleId="ai" />;

  return (
    <div className="flex flex-col max-w-3xl mx-auto h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
              {t('المساعد الذكي', 'AI Assistant')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {t('متصل', 'Online')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={toggle} className="gap-1.5">
          <Globe className="w-4 h-4" />
          {lang === 'ar' ? 'EN' : 'ع'}
        </Button>
      </div>

      {/* Messages */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            return (
              <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                {/* Avatar */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300',
                )}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Bubble + suggestions */}
                <div className={cn(
                  'flex flex-col gap-2 min-w-0',
                  msg.role === 'user' ? 'items-end max-w-[75%]' : 'items-start max-w-[85%]',
                )}>
                  {msg.text && (
                    <div className={cn(
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 dark:bg-neutral-700 text-gray-900 dark:text-gray-100 rounded-tl-sm',
                    )}>
                      {msg.text}
                    </div>
                  )}

                  {/* Suggestions — only interactive on last message */}
                  {msg.role === 'assistant' && msg.suggestions && (
                    <SuggestionPills
                      suggestions={msg.suggestions}
                      onSelect={handleSuggestion}
                      disabled={!isLast || isLoading}
                    />
                  )}

                  {/* Confirm card — only interactive on last message */}
                  {msg.confirmCard && isLast && (
                    <ConfirmCardWidget
                      card={msg.confirmCard}
                      lang={lang}
                      onConfirm={() => void handleConfirm(booking)}
                      onCancel={handleCancelBooking}
                      loading={confirmLoading}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {llmLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="bg-gray-100 dark:bg-neutral-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-dot-flash [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-dot-flash [animation-delay:160ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-dot-flash [animation-delay:320ms]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </CardContent>

        {/* Input area */}
        <div className="border-t border-gray-100 dark:border-neutral-700 p-4 flex-shrink-0">
          {booking.step === 'get_patient' && (
            <p className="text-xs text-primary-600 dark:text-primary-400 mb-2 font-medium animate-pulse">
              {t('✍️ اكتب اسم المريض ثم اضغط Enter', '✍️ Type the patient\'s name then press Enter')}
            </p>
          )}
          {booking.step === 'get_fee' && (
            <p className="text-xs text-primary-600 dark:text-primary-400 mb-2 font-medium animate-pulse">
              {t('💰 اكتب تعرفة الجلسة (بالجنيه) ثم اضغط Enter', '💰 Type the session fee (EGP) then press Enter')}
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('اكتب رسالتك...', 'Type your message...')}
                rows={1}
                className={cn(
                  'w-full resize-none rounded-xl border border-gray-200 dark:border-neutral-600',
                  'bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600',
                  'transition-shadow duration-150 max-h-32 overflow-y-auto',
                )}
                style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}
              />
              <p className="absolute bottom-1 end-3 text-[10px] text-gray-300 dark:text-gray-600 select-none">
                {t('Enter للإرسال', 'Enter to send')}
              </p>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="w-11 h-11 flex-shrink-0 rounded-xl"
            >
              {llmLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
