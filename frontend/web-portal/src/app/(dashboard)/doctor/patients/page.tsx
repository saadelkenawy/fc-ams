'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { formatDate, getInitials } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { usePatients } from '@/hooks/usePatients';

function getUser() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('fadl_user') ?? '{}');
  } catch {
    return {};
  }
}

interface PatientSummary {
  patientId: string;
  lastVisit: string;
  count: number;
}

export default function DoctorPatientsPage() {
  const { lang, t } = useLang();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const user = getUser();
  const doctorId = user.doctorId as string | undefined;

  // Fetch all appointments for this doctor (up to 200)
  const { data: apptData, isLoading: apptLoading } = useAppointments({
    doctorId,
    limit: 200,
  });
  const appointments = apptData?.data ?? [];

  // Build unique patient summary from appointments
  const patientSummaryMap = useMemo(() => {
    const map = new Map<string, PatientSummary>();
    for (const appt of appointments) {
      const existing = map.get(appt.patientId);
      if (!existing) {
        map.set(appt.patientId, {
          patientId: appt.patientId,
          lastVisit: appt.appointmentDate,
          count: 1,
        });
      } else {
        map.set(appt.patientId, {
          ...existing,
          lastVisit: appt.appointmentDate > existing.lastVisit ? appt.appointmentDate : existing.lastVisit,
          count: existing.count + 1,
        });
      }
    }
    return map;
  }, [appointments]);

  const uniquePatientIds = useMemo(() => Array.from(patientSummaryMap.keys()), [patientSummaryMap]);

  // Fetch patient details for all unique patients
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    limit: 200,
  });
  const allPatients = patientsData?.data ?? [];

  // Build a patient detail map
  const patientDetailMap = useMemo(() => {
    const map = new Map<string, { nameEn: string; nameAr?: string }>();
    for (const p of allPatients) {
      map.set(p.patientId, { nameEn: p.nameEn, nameAr: p.nameAr });
    }
    return map;
  }, [allPatients]);

  // Merge summaries with patient details
  const patientList = useMemo(() => {
    return uniquePatientIds.map((pid) => {
      const summary = patientSummaryMap.get(pid)!;
      const detail = patientDetailMap.get(pid);
      return {
        patientId: pid,
        nameEn: detail?.nameEn ?? pid.slice(-8).toUpperCase(),
        nameAr: detail?.nameAr,
        lastVisit: summary.lastVisit,
        count: summary.count,
      };
    }).sort((a, b) => (b.lastVisit > a.lastVisit ? 1 : -1));
  }, [uniquePatientIds, patientSummaryMap, patientDetailMap]);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!query.trim()) return patientList;
    const q = query.toLowerCase();
    return patientList.filter((p) =>
      p.nameEn.toLowerCase().includes(q) ||
      (p.nameAr ?? '').includes(q) ||
      p.patientId.toLowerCase().includes(q),
    );
  }, [patientList, query]);

  const isLoading = apptLoading || patientsLoading;

  if (!doctorId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {t('هذه الصفحة متاحة للأطباء فقط', 'This page is available for doctors only')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('مرضاي', 'My Patients')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('جميع المرضى الذين تمت معاينتهم', 'All patients seen in appointments')}
          </p>
        </div>
        <div className="bg-primary-50 dark:bg-primary-900/30 rounded-xl px-4 py-2 text-center">
          <p className="text-2xl font-bold font-mono text-primary-700 dark:text-primary-400">
            {patientList.length}
          </p>
          <p className="text-[10px] text-primary-600 dark:text-primary-500 font-medium">
            {t('مريض', 'patients')}
          </p>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder={t('بحث باسم المريض...', 'Search by patient name...')}
        icon={<Search className="w-4 h-4" />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
        lang={lang}
      />

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin me-2" />
              {t('جاري التحميل...', 'Loading...')}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                {query
                  ? t('لا توجد نتائج مطابقة', 'No matching patients')
                  : t('لا توجد مرضى بعد', 'No patients yet')}
              </p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <ul className="divide-y divide-gray-50 dark:divide-neutral-700/50">
              {filtered.map((patient) => {
                const displayName = lang === 'ar'
                  ? (patient.nameAr ?? patient.nameEn)
                  : patient.nameEn;
                const initials = getInitials(displayName);
                return (
                  <li
                    key={patient.patientId}
                    onClick={() => router.push(`/patients/${patient.patientId}`)}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-neutral-700/30 transition-colors cursor-pointer"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 text-primary-700 dark:text-primary-400 text-sm font-bold select-none">
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                        {displayName}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                        #{patient.patientId.slice(-8).toUpperCase()}
                      </p>
                    </div>

                    {/* Last visit */}
                    <div className="text-end flex-shrink-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('آخر زيارة', 'Last visit')}
                      </p>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5">
                        {formatDate(patient.lastVisit, lang === 'ar' ? 'ar-EG' : 'en-US')}
                      </p>
                    </div>

                    {/* Count */}
                    <div className="flex-shrink-0 bg-gray-100 dark:bg-neutral-700 rounded-lg px-2.5 py-1 text-center min-w-[2.5rem]">
                      <p className="text-sm font-bold font-mono text-gray-700 dark:text-gray-300">
                        {patient.count}
                      </p>
                      <p className="text-[9px] text-gray-400 dark:text-gray-500">
                        {t('موعد', 'appts')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
