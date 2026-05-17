'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Save, CheckCheck, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { ehrApi } from '@/lib/api';
import type { Encounter } from '@/hooks/useEncounters';

/* ── types ───────────────────────────────────────────────────────────── */

interface RxRow { id: number; drug: string; dosage: string; duration: string }

interface Props {
  open: boolean;
  encounter: Encounter | null;
  patientName?: string;
  doctorName?: string;
  onClose: () => void;
}

const TABS = [
  { key: 'notes',   labelAr: 'الملاحظات السريرية', labelEn: 'Clinical Notes' },
  { key: 'rx',      labelAr: 'الوصفة الطبية',       labelEn: 'Prescription'   },
  { key: 'followup',labelAr: 'المتابعة',             labelEn: 'Follow-up'      },
] as const;
type TabKey = typeof TABS[number]['key'];

const SOAP = [
  { key: 'S', labelAr: 'ذاتي (شكوى المريض)',   labelEn: 'Subjective',  placeholderAr: 'ما يشكو منه المريض…',          placeholderEn: "Patient's chief complaint…"         },
  { key: 'O', labelAr: 'موضوعي (النتائج)',      labelEn: 'Objective',   placeholderAr: 'النتائج والفحص السريري…',        placeholderEn: 'Examination findings…'              },
  { key: 'A', labelAr: 'التقييم',               labelEn: 'Assessment',  placeholderAr: 'التشخيص والتقييم السريري…',      placeholderEn: 'Clinical assessment…'              },
  { key: 'P', labelAr: 'الخطة العلاجية',        labelEn: 'Plan',        placeholderAr: 'خطة العلاج والإجراءات…',         placeholderEn: 'Treatment plan and next steps…'    },
] as const;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'outline'> = {
  completed:  'success',
  signed_off: 'success',
  in_progress:'warning',
  draft:      'outline',
};

/* ── component ───────────────────────────────────────────────────────── */

export function EncounterDetailModal({ open, encounter, patientName, doctorName, onClose }: Props) {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();

  const [tab, setTab]           = useState<TabKey>('notes');
  const [diagnosis, setDiagnosis] = useState('');
  const [soap, setSoap]         = useState({ S: '', O: '', A: '', P: '' });
  const [followUp, setFollowUp] = useState('');
  const [instructions, setInstructions] = useState('');
  const [followUpType, setFollowUpType] = useState('clinic');
  const [rx, setRx] = useState<RxRow[]>([{ id: 1, drug: '', dosage: '', duration: '' }]);

  /* reset state when encounter changes */
  useEffect(() => {
    if (encounter) {
      setDiagnosis(encounter.diagnosisPrimary ?? '');
      /* parse clinicalNotes as JSON SOAP if possible, else put in S */
      try {
        const parsed = JSON.parse(encounter.clinicalNotes ?? '{}') as Record<string, string>;
        setSoap({ S: parsed.S ?? '', O: parsed.O ?? '', A: parsed.A ?? '', P: parsed.P ?? '' });
      } catch {
        setSoap({ S: encounter.clinicalNotes ?? '', O: '', A: '', P: '' });
      }
      setFollowUp('');
      setInstructions('');
      setRx([{ id: Date.now(), drug: '', dosage: '', duration: '' }]);
      setTab('notes');
    }
  }, [encounter?.id]);

  /* PATCH mutation */
  const saveMutation = useMutation({
    mutationFn: async ({ signOff }: { signOff: boolean }) => {
      if (!encounter) return;
      await ehrApi.patch(`/encounters/${encounter.id}`, {
        diagnosisPrimary: diagnosis || undefined,
        clinicalNotes:    JSON.stringify(soap),
        status:           signOff ? 'signed_off' : 'in_progress',
      });
      if (signOff) {
        await ehrApi.post(`/encounters/${encounter.id}/sign-off`, {});
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['encounters'] });
      onClose();
    },
  });

  function addRx() {
    setRx((prev) => [...prev, { id: Date.now(), drug: '', dosage: '', duration: '' }]);
  }
  function removeRx(id: number) {
    setRx((prev) => prev.filter((r) => r.id !== id));
  }
  function updateRx(id: number, field: keyof Omit<RxRow, 'id'>, val: string) {
    setRx((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  if (!open || !encounter) return null;

  const isSigned = encounter.status === 'signed_off';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/55"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* panel */}
      <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-neutral-700">

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 flex items-center justify-center text-lg font-bold flex-shrink-0">
              {(patientName ?? '#').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-display font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight">
                {patientName ?? `#${encounter.patientId.slice(-8).toUpperCase()}`}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {doctorName ?? `#${encounter.doctorId.slice(-8).toUpperCase()}`}
                {' · '}
                <span dir="ltr">{encounter.encounterDate}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={STATUS_VARIANT[encounter.status] ?? 'default'} dot>
              {encounter.status === 'signed_off'  ? t('موقَّع',       'Signed Off')  :
               encounter.status === 'completed'   ? t('مكتمل',       'Completed')   :
               encounter.status === 'in_progress' ? t('جارٍ',        'In Progress') :
                                                    t('مسودة',       'Draft')}
            </Badge>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diagnosis strip */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-100 dark:border-neutral-800 flex-shrink-0">
          <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 block">
            {t('التشخيص', 'Diagnosis')}
          </label>
          <input
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            disabled={isSigned}
            className="w-full bg-transparent text-sm font-medium text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 disabled:opacity-60"
            placeholder={t('أدخل التشخيص…', 'Enter diagnosis…')}
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-neutral-800 flex-shrink-0 px-6">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                'py-2.5 px-1 me-5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === tb.key
                  ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
              )}
            >
              {lang === 'ar' ? tb.labelAr : tb.labelEn}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Clinical Notes (SOAP) ── */}
          {tab === 'notes' && (
            <div className="space-y-4">
              {SOAP.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 rounded-md bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {s.key}
                    </span>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      {lang === 'ar' ? s.labelAr : s.labelEn}
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    disabled={isSigned}
                    value={soap[s.key as keyof typeof soap]}
                    onChange={(e) => setSoap((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder={lang === 'ar' ? s.placeholderAr : s.placeholderEn}
                    className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:bg-white dark:focus:bg-neutral-700 transition-all resize-none disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Prescription builder ── */}
          {tab === 'rx' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                {t('أضف الأدوية والجرعات للوصفة الطبية', 'Add medications and dosages to the prescription')}
              </p>
              {rx.map((row) => (
                <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                  <Input
                    placeholder={t('اسم الدواء', 'Drug name')}
                    value={row.drug}
                    onChange={(e) => updateRx(row.id, 'drug', e.target.value)}
                    disabled={isSigned}
                  />
                  <Input
                    placeholder={t('الجرعة', 'Dosage')}
                    value={row.dosage}
                    onChange={(e) => updateRx(row.id, 'dosage', e.target.value)}
                    disabled={isSigned}
                  />
                  <Input
                    placeholder={t('المدة', 'Duration')}
                    value={row.duration}
                    onChange={(e) => updateRx(row.id, 'duration', e.target.value)}
                    disabled={isSigned}
                  />
                  <button
                    onClick={() => removeRx(row.id)}
                    disabled={isSigned || rx.length === 1}
                    className="h-11 w-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {!isSigned && (
                <Button variant="outline" size="sm" onClick={addRx}>
                  <Plus className="w-4 h-4" />
                  {t('إضافة دواء', 'Add medication')}
                </Button>
              )}
            </div>
          )}

          {/* ── Follow-up ── */}
          {tab === 'followup' && (
            <div className="space-y-4">
              <Input
                label={t('تاريخ المتابعة', 'Follow-up date')}
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={isSigned}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('تعليمات للمريض', 'Patient instructions')}
                </label>
                <textarea
                  rows={4}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={isSigned}
                  placeholder={t(
                    'تعليمات ما بعد الزيارة، نصائح، أو ملاحظات إضافية…',
                    'Post-visit instructions, advice, or additional notes…',
                  )}
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:bg-white dark:focus:bg-neutral-700 transition-all resize-none disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t('طبيعة المتابعة', 'Follow-up type')}
                  </label>
                  <select
                    value={followUpType}
                    onChange={(e) => setFollowUpType(e.target.value)}
                    disabled={isSigned}
                    className="w-full h-11 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:opacity-60"
                  >
                    <option value="clinic">{t('زيارة في العيادة', 'In-clinic visit')}</option>
                    <option value="tele">{t('استشارة عن بُعد', 'Teleconsult')}</option>
                    <option value="labs">{t('تحاليل فقط', 'Labs only')}</option>
                  </select>
                </div>
                <Input
                  label={t('الطبيب المحال إليه', 'Referring doctor')}
                  placeholder={t('اختياري', 'Optional')}
                  disabled={isSigned}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30 flex-shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {isSigned
              ? t('هذه الحالة موقَّعة ولا يمكن تعديلها', 'This encounter is signed and locked')
              : t('آخر تحديث: الآن', 'Last saved: just now')}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('إغلاق', 'Close')}
            </Button>
            {!isSigned && (
              <>
                <Button
                  variant="secondary"
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ signOff: false })}
                >
                  <Save className="w-4 h-4" />
                  {t('حفظ مسودة', 'Save Draft')}
                </Button>
                <Button
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ signOff: true })}
                >
                  <CheckCheck className="w-4 h-4" />
                  {t('توقيع وإغلاق', 'Sign & Close')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
