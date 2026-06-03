'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText, Loader2, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import { usePatientBatch } from '@/hooks/usePatients';
import { ehrApi } from '@/lib/api';

interface Encounter {
  id: string;
  patientId: string;
  appointmentId?: string;
  doctorId: string;
  encounterDate: string;
  chiefComplaint?: string;
  diagnosisPrimary?: string;
  clinicalNotes?: string;
  status: string;
  createdAt: string;
}

export default function DoctorNotesPage() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const doctorId = user?.doctorId;

  const [query, setQuery] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['doctor-encounters', doctorId],
    queryFn: async () => {
      const res = await ehrApi.get<{ data: Encounter[] }>('/encounters', {
        params: { doctorId, limit: 100 },
      });
      return res.data.data ?? [];
    },
    enabled: !!doctorId,
    staleTime: 60_000,
  });

  const encounters: Encounter[] = data ?? [];

  const patientIds = useMemo(() => [...new Set(encounters.map((e) => e.patientId))], [encounters]);
  const patientMap = usePatientBatch(patientIds);

  const filtered = useMemo(() => {
    if (!query.trim()) return encounters;
    const q = query.toLowerCase();
    return encounters.filter((e) => {
      const p = patientMap.get(e.patientId);
      const name = p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : '';
      return (
        name.toLowerCase().includes(q) ||
        (e.chiefComplaint ?? '').toLowerCase().includes(q) ||
        (e.diagnosisPrimary ?? '').toLowerCase().includes(q) ||
        (e.clinicalNotes ?? '').toLowerCase().includes(q)
      );
    });
  }, [encounters, query, patientMap, lang]);

  function resolvePatientName(patientId: string) {
    const p = patientMap.get(patientId);
    return p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : `#${patientId.slice(0, 8)}`;
  }

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
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('الملاحظات السريرية', 'Clinical Notes')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('سجلات الحالات والتشخيصات', 'Encounter records and diagnoses')}
          </p>
        </div>
        <div className="bg-primary-50 dark:bg-primary-900/30 rounded-xl px-4 py-2 text-center">
          <p className="text-2xl font-bold font-mono text-primary-700 dark:text-primary-400">
            {encounters.length}
          </p>
          <p className="text-[10px] text-primary-600 dark:text-primary-500 font-medium">
            {t('حالة', 'encounters')}
          </p>
        </div>
      </div>

      <Input
        placeholder={t('بحث بالمريض أو التشخيص...', 'Search by patient or diagnosis...')}
        icon={<Search className="w-4 h-4" />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
        lang={lang}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin me-2" />
          {t('جاري التحميل...', 'Loading...')}
        </div>
      )}

      {isError && (
        <div className="py-10 text-center text-red-500 dark:text-red-400 text-sm">
          {t('تعذّر تحميل الملاحظات السريرية', 'Failed to load clinical notes')}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="py-16 text-center">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {query
              ? t('لا توجد نتائج مطابقة', 'No matching notes')
              : t('لا توجد ملاحظات سريرية بعد', 'No clinical notes yet')}
          </p>
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((enc) => (
            <Card key={enc.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {resolvePatientName(enc.patientId)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{enc.status}</Badge>
                    </div>

                    {enc.chiefComplaint && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium text-gray-500 dark:text-gray-400">
                          {t('الشكوى: ', 'Chief complaint: ')}
                        </span>
                        {enc.chiefComplaint}
                      </p>
                    )}

                    {enc.diagnosisPrimary && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium text-gray-500 dark:text-gray-400">
                          {t('التشخيص: ', 'Diagnosis: ')}
                        </span>
                        {enc.diagnosisPrimary}
                      </p>
                    )}

                    {enc.clinicalNotes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 bg-gray-50 dark:bg-neutral-800 rounded-lg px-3 py-2">
                        {enc.clinicalNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0 text-end">
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {formatDate(enc.encounterDate, lang === 'ar' ? 'ar-EG' : 'en-US')}
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-1">
                      #{enc.id.slice(-8).toUpperCase()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
