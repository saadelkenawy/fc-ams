'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, CalendarDays, TrendingUp, Clock, Stethoscope, Activity, RefreshCw } from 'lucide-react';
import {
  CRow, CCol, CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CTable, CTableHead, CTableBody, CTableRow, CTableHeaderCell, CTableDataCell,
  CButton, CSpinner,
} from '@coreui/react';
import { CChartBar } from '@coreui/react-chartjs';
import { StatCard } from '@/components/ui/StatCard';
import { AppointmentStatusBadge, Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatTime, localDateISO } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctorMap, useDoctors, useSpecialtyMap } from '@/hooks/useDoctors';
import { usePatients, usePatientMap } from '@/hooks/usePatients';
import type { Appointment, AppointmentStatus } from '@fadl/types';

type ChartView = 'hour' | 'status' | 'specialty';

const STATUS_ORDER: AppointmentStatus[] = ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.', 'Ref.'];
const BRAND = 'rgba(183,28,28,0.85)';
const BRAND_SOFT = 'rgba(183,28,28,0.15)';

function apptHour(a: Appointment): number {
  const n = parseInt(String(a.startTime).slice(0, 2), 10);
  return Number.isNaN(n) ? 0 : n;
}

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { user }    = useAuth();
  const router      = useRouter();
  const now  = new Date();
  const hour = now.getHours();
  const greetAr = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';
  const greetEn = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const isDoctor = user?.role === 'doctor';
  const today    = localDateISO();
  const [view, setView] = useState<ChartView>('hour');

  const { data: apptData, isLoading: apptLoading, refetch } = useAppointments({
    date:     today,
    limit:    50,
    doctorId: isDoctor ? (user?.doctorId ?? undefined) : undefined,
  });
  const { data: doctorData }   = useDoctors({ limit: 1 });
  const { data: patientData }  = usePatients({ limit: 1 });
  const appointments  = apptData?.data ?? [];
  const doctorMap     = useDoctorMap();
  const specialtyMap  = useSpecialtyMap();
  const patientMap    = usePatientMap();

  const pendingConfirm  = appointments.filter((a) => a.status === 'TBC').length;
  const confirmedCount  = appointments.filter((a) => ['Conf.', 'Ok!'].includes(a.status)).length;
  const completedCount  = appointments.filter((a) => a.status === 'Comp.').length;
  const totalDoctors    = doctorData?.total ?? 0;
  const totalPatients   = patientData?.total ?? 0;

  /* Hourly histogram (clinic hours 8–20) — also feeds the appointments sparkline */
  const hourly = useMemo(() => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
    const counts = hours.map((h) => appointments.filter((a) => apptHour(a) === h).length);
    return { hours, counts };
  }, [appointments]);

  const chart = useMemo(() => {
    if (view === 'status') {
      const present = STATUS_ORDER.filter((s) => appointments.some((a) => a.status === s));
      return {
        labels: present,
        values: present.map((s) => appointments.filter((a) => a.status === s).length),
      };
    }
    if (view === 'specialty') {
      const map = new Map<string, number>();
      appointments.forEach((a) => {
        const spec = a.specialtyId ? specialtyMap.get(a.specialtyId) : null;
        const label = spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : t('غير محدد', 'Unassigned');
        map.set(label, (map.get(label) ?? 0) + 1);
      });
      const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      return { labels: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
    }
    return { labels: hourly.hours.map((h) => `${h}:00`), values: hourly.counts };
  }, [view, appointments, hourly, specialtyMap, lang, t]);

  const TABS: { key: ChartView; ar: string; en: string }[] = [
    { key: 'hour',      ar: 'حسب الساعة',  en: 'By Hour' },
    { key: 'status',    ar: 'حسب الحالة',  en: 'By Status' },
    { key: 'specialty', ar: 'حسب التخصص',  en: 'By Specialty' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Greeting row */}
      <div className="d-flex align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h2 className="h4 fw-bold font-display mb-1 text-body-emphasis">
            {t(`${greetAr}،`, `${greetEn},`)} {lang === 'ar' ? user?.nameAr : user?.nameEn}
          </h2>
          <p className="text-body-secondary small mb-0">
            {t(
              now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
              now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            )}
          </p>
        </div>
        <CButton color="secondary" variant="outline" size="sm" onClick={() => refetch()} title={t('تحديث', 'Refresh')} aria-label={t('تحديث البيانات', 'Refresh data')}>
          <RefreshCw style={{ width: 16, height: 16 }} />
        </CButton>
      </div>

      {/* Stat widgets */}
      <CRow className="mb-4">
        {(isDoctor
          ? [
              { title: t('مواعيد اليوم', "Today's Appointments"), value: apptLoading ? '…' : appointments.length, icon: <CalendarDays style={{ width: 20, height: 20 }} />, color: 'blue' as const, description: t('موعد مجدول', 'scheduled today'), sparkline: hourly.counts },
              { title: t('مؤكد / تسجيل دخول', 'Confirmed / Checked-in'), value: apptLoading ? '…' : confirmedCount, icon: <Activity style={{ width: 20, height: 20 }} />, color: 'emerald' as const, description: t('جاهز للاستقبال', 'ready to receive') },
              { title: t('بانتظار التأكيد', 'Pending Confirm'), value: apptLoading ? '…' : pendingConfirm, icon: <Clock style={{ width: 20, height: 20 }} />, color: 'amber' as const, description: t('تحتاج مراجعة', 'need review') },
              { title: t('مكتمل اليوم', 'Completed Today'), value: apptLoading ? '…' : completedCount, icon: <Stethoscope style={{ width: 20, height: 20 }} />, color: 'violet' as const, description: t('جلسة منتهية', 'sessions done') },
            ]
          : [
              { title: t('الأطباء', 'Total Doctors'), value: totalDoctors || '—', icon: <Stethoscope style={{ width: 20, height: 20 }} />, color: 'blue' as const, description: t('طبيب مسجل', 'registered doctors') },
              { title: t('المرضى', 'Total Patients'), value: totalPatients || '—', icon: <Users style={{ width: 20, height: 20 }} />, color: 'emerald' as const, description: t('مريض مسجل', 'registered patients') },
              { title: t('مواعيد اليوم', "Today's Appointments"), value: apptLoading ? '…' : appointments.length, icon: <CalendarDays style={{ width: 20, height: 20 }} />, color: 'amber' as const, description: `${confirmedCount} ${t('مؤكد', 'confirmed')}`, sparkline: hourly.counts },
              { title: t('بانتظار التأكيد', 'Pending Confirm'), value: apptLoading ? '…' : pendingConfirm, icon: <Clock style={{ width: 20, height: 20 }} />, color: 'violet' as const, description: t('تحتاج مراجعة', 'need review') },
            ]
        ).map((w, i) => (
          <CCol key={i} xs={6} lg={3}>
            <StatCard {...w} />
          </CCol>
        ))}
      </CRow>

      {/* Insights chart card with tabs */}
      <CCard className="mb-4">
        <CCardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <TrendingUp style={{ width: 16, height: 16 }} className="text-primary" />
            <span className="fw-semibold">{t('تحليل مواعيد اليوم', "Today's Appointment Insights")}</span>
          </div>
          <CNav variant="tabs" className="card-header-tabs">
            {TABS.map((tab) => (
              <CNavItem key={tab.key}>
                <CNavLink
                  href="#"
                  active={view === tab.key}
                  onClick={(e) => { e.preventDefault(); setView(tab.key); }}
                >
                  {lang === 'ar' ? tab.ar : tab.en}
                </CNavLink>
              </CNavItem>
            ))}
          </CNav>
        </CCardHeader>
        <CCardBody>
          {apptLoading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ height: 300 }}>
              <CSpinner color="primary" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="d-flex flex-column align-items-center justify-content-center text-body-secondary" style={{ height: 300 }}>
              <CalendarDays style={{ width: 28, height: 28 }} className="mb-2 opacity-50" />
              {t('لا توجد مواعيد اليوم', 'No appointments today')}
            </div>
          ) : (
            <CChartBar
              style={{ height: 300 }}
              data={{
                labels: chart.labels,
                datasets: [
                  {
                    label: t('عدد المواعيد', 'Appointments'),
                    backgroundColor: BRAND_SOFT,
                    borderColor: BRAND,
                    borderWidth: 1,
                    borderRadius: 6,
                    data: chart.values,
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false } },
                  y: { beginAtZero: true, ticks: { precision: 0 } },
                },
              }}
            />
          )}
        </CCardBody>
      </CCard>

      <CRow>
        {/* Appointments table */}
        <CCol lg={8} className="mb-4">
          <CCard className="h-100">
            <CCardHeader className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <Activity style={{ width: 16, height: 16 }} className="text-primary" />
                <span className="fw-semibold">{t('مواعيد اليوم', "Today's Appointments")}</span>
              </div>
              <Badge variant="outline">{apptData?.total ?? 0} {t('موعد', 'total')}</Badge>
            </CCardHeader>
            <CCardBody className="p-0">
              <CTable hover responsive className="mb-0 align-middle">
                <CTableHead className="text-body-secondary">
                  <CTableRow>
                    <CTableHeaderCell scope="col">{t('المريض', 'Patient')}</CTableHeaderCell>
                    <CTableHeaderCell scope="col">{t('الوقت', 'Time')}</CTableHeaderCell>
                    <CTableHeaderCell scope="col">{t('التخصص', 'Specialty')}</CTableHeaderCell>
                    <CTableHeaderCell scope="col">{t('الحالة', 'Status')}</CTableHeaderCell>
                    <CTableHeaderCell scope="col">{t('المصدر', 'Source')}</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {apptLoading && Array.from({ length: 5 }).map((_, i) => (
                    <CTableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <CTableDataCell key={j}>
                          <div className="placeholder-glow"><span className="placeholder col-8" /></div>
                        </CTableDataCell>
                      ))}
                    </CTableRow>
                  ))}
                  {!apptLoading && appointments.slice(0, 10).map((appt) => {
                    const spec    = appt.specialtyId ? specialtyMap.get(appt.specialtyId) : null;
                    const patient = patientMap.get(appt.patientId);
                    const patName = patient
                      ? (lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                      : appt.patientId.slice(-8).toUpperCase();
                    return (
                      <CTableRow key={appt.id}>
                        <CTableDataCell className="fw-medium text-truncate" style={{ maxWidth: 160 }} title={patName}>{patName}</CTableDataCell>
                        <CTableDataCell className="font-monospace small" dir="ltr">{formatTime(appt.startTime)}</CTableDataCell>
                        <CTableDataCell className="text-body-secondary">{spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : '—'}</CTableDataCell>
                        <CTableDataCell><AppointmentStatusBadge status={appt.status} lang={lang} /></CTableDataCell>
                        <CTableDataCell>
                          {appt.patientSource
                            ? <Badge variant="outline" className="text-capitalize">{appt.patientSource}</Badge>
                            : <span className="text-body-secondary">—</span>}
                        </CTableDataCell>
                      </CTableRow>
                    );
                  })}
                  {!apptLoading && appointments.length === 0 && (
                    <CTableRow>
                      <CTableDataCell colSpan={5} className="text-center py-5 text-body-secondary">
                        {t('لا توجد مواعيد اليوم', 'No appointments today')}
                      </CTableDataCell>
                    </CTableRow>
                  )}
                </CTableBody>
              </CTable>
            </CCardBody>
          </CCard>
        </CCol>

        {/* Quick schedule panel */}
        <CCol lg={4} className="mb-4">
          <CCard className="h-100">
            <CCardHeader className="d-flex align-items-center gap-2">
              <TrendingUp style={{ width: 16, height: 16 }} className="text-primary" />
              <span className="fw-semibold">{t('الجدول السريع', 'Quick Schedule')}</span>
            </CCardHeader>
            <CCardBody className="d-flex flex-column gap-2">
              {apptLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="placeholder-glow"><span className="placeholder col-12" style={{ height: 44, borderRadius: 8 }} /></div>
              ))}
              {!apptLoading && appointments.slice(0, 6).map((appt) => {
                const doctor  = appt.doctorId ? doctorMap.get(appt.doctorId) : null;
                const spec    = appt.specialtyId ? specialtyMap.get(appt.specialtyId) : null;
                const patient = patientMap.get(appt.patientId);
                const patName = patient
                  ? (lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                  : appt.patientId.slice(-4).toUpperCase();
                const doctorLabel = doctor
                  ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn)
                  : (spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : '—');
                return (
                  <button
                    key={appt.id}
                    onClick={() => router.push(`/appointments?date=${localDateISO(now)}`)}
                    className="d-flex align-items-center gap-3 p-2 rounded border-0 bg-body-tertiary text-start w-100"
                    style={{ cursor: 'pointer' }}
                    aria-label={t(
                      `موعد ${patName} مع ${doctorLabel} الساعة ${formatTime(appt.startTime)}`,
                      `Appointment: ${patName} with ${doctorLabel} at ${formatTime(appt.startTime)}`,
                    )}
                  >
                    <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary fw-bold flex-shrink-0" style={{ width: 32, height: 32, fontSize: 12 }} aria-hidden="true">
                      {patName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-grow-1 overflow-hidden">
                      <div className="small fw-medium text-truncate text-body-emphasis">{patName}</div>
                      <div className="text-body-secondary text-truncate" style={{ fontSize: 11 }}>{doctorLabel}</div>
                    </div>
                    <span className="text-body-secondary small font-monospace flex-shrink-0" dir="ltr">{formatTime(appt.startTime)}</span>
                  </button>
                );
              })}
              {!apptLoading && appointments.length === 0 && (
                <p className="text-body-secondary small text-center py-3 mb-0">{t('لا مواعيد اليوم', 'No appointments today')}</p>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
}
