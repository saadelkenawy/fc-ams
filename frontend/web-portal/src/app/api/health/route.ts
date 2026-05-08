import { NextResponse } from 'next/server';

const SERVICES = [
  { key: 'identity',     name: 'Identity Service',      nameAr: 'خدمة الهوية',          url: 'http://identity-service:3000/health' },
  { key: 'appointment',  name: 'Appointment Service',   nameAr: 'خدمة المواعيد',         url: 'http://appointment-service:3001/health' },
  { key: 'patient',      name: 'Patient Service',       nameAr: 'خدمة المرضى',           url: 'http://patient-service:3002/health' },
  { key: 'doctor',       name: 'Doctor Service',        nameAr: 'خدمة الأطباء',          url: 'http://doctor-service:3003/health' },
  { key: 'billing',      name: 'Billing Service',       nameAr: 'خدمة الفواتير',         url: 'http://billing-service:3004/health' },
  { key: 'ehr',          name: 'EHR Service',           nameAr: 'خدمة السجل الطبي',      url: 'http://ehr-service:3005/health' },
  { key: 'procedure',    name: 'Procedure Service',     nameAr: 'خدمة الإجراءات',        url: 'http://procedure-service:3006/health' },
  { key: 'notification', name: 'Notification Service',  nameAr: 'خدمة الإشعارات',        url: 'http://notification-service:3007/health' },
  { key: 'chatbot',      name: 'AI Chatbot Service',    nameAr: 'خدمة المساعد الذكي',    url: 'http://ai-chatbot-service:3008/health' },
  { key: 'analytics',    name: 'Analytics Service',     nameAr: 'خدمة التحليلات',        url: 'http://analytics-service:3009/health' },
];

export async function GET() {
  const results = await Promise.allSettled(
    SERVICES.map(async (svc) => {
      const start = Date.now();
      const res = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
      return { key: svc.key, name: svc.name, nameAr: svc.nameAr, ok: res.ok, ms: Date.now() - start };
    }),
  );

  const statuses = results.map((r, i) => {
    const svc = SERVICES[i];
    if (r.status === 'fulfilled') return r.value;
    return { key: svc.key, name: svc.name, nameAr: svc.nameAr, ok: false, ms: null };
  });

  return NextResponse.json({ services: statuses, checkedAt: new Date().toISOString() });
}
