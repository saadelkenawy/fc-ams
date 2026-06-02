'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Save, CheckCheck, Activity, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { ehrApi } from '@/lib/api';
import { PrescriptionForm } from '@/components/prescriptions/PrescriptionForm';
import type { Encounter } from '@/hooks/useEncounters';

/* ── types ───────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  encounter: Encounter | null;
  patientName?: string;
  doctorName?: string;
  onClose: () => void;
}

interface VitalFields {
  systolic_bp:       string;
  diastolic_bp:      string;
  heart_rate:        string;
  temperature:       string;
  oxygen_saturation: string;
  respiratory_rate:  string;
  weight_kg:         string;
  height_cm:         string;
}

interface LabOrder {
  id:     string;
  name:   string;
  urgent: boolean;
  status: 'ordered' | 'collected' | 'resulted';
}

/* ── constants ───────────────────────────────────────────────────────── */

const EMPTY_VITALS: VitalFields = {
  systolic_bp: '', diastolic_bp: '', heart_rate: '',
  temperature: '', oxygen_saturation: '', respiratory_rate: '',
  weight_kg: '', height_cm: '',
};

const LAB_PRESETS = [
  'CBC', 'LFTs', 'RFTs', 'HbA1c', 'Lipid Profile',
  'TSH', 'Fasting Glucose', 'Urine Analysis', 'CRP', 'ESR', 'PT/INR',
];

const VITAL_GRID = [
  { key: 'heart_rate'        as keyof VitalFields, labelEn: 'Heart Rate',       labelAr: 'معدل النبض',     unit: 'bpm',  min: 30,  max: 250 },
  { key: 'temperature'       as keyof VitalFields, labelEn: 'Temperature',       labelAr: 'درجة الحرارة',   unit: '°C',   min: 34,  max: 43  },
  { key: 'oxygen_saturation' as keyof VitalFields, labelEn: 'O₂ Saturation',     labelAr: 'تشبع الأكسجين', unit: '%',    min: 70,  max: 100 },
  { key: 'respiratory_rate'  as keyof VitalFields, labelEn: 'Respiratory Rate',   labelAr: 'معدل التنفس',   unit: '/min', min: 5,   max: 60  },
  { key: 'weight_kg'         as keyof VitalFields, labelEn: 'Weight',             labelAr: 'الوزن',          unit: 'kg',   min: 1,   max: 500 },
  { key: 'height_cm'         as keyof VitalFields, labelEn: 'Height',             labelAr: 'الطول',          unit: 'cm',   min: 30,  max: 250 },
] as const;

const LAB_STATUS_VARIANT: Record<LabOrder['status'], 'warning' | 'default' | 'success'> = {
  ordered:   'warning',
  collected: 'default',
  resulted:  'success',
};

const TABS = [
  { key: 'notes',   labelAr: 'الملاحظات السريرية', labelEn: 'Clinical Notes' },
  { key: 'vitals',  labelAr: 'العلامات الحيوية',    labelEn: 'Vitals'         },
  { key: 'labs',    labelAr: 'طلبات المختبر',       labelEn: 'Lab Orders'     },
  { key: 'rx',      labelAr: 'الوصفة الطبية',       labelEn: 'Prescription'   },
  { key: 'followup',labelAr: 'المتابعة',             labelEn: 'Follow-up'      },
] as const;
type TabKey = typeof TABS[number]['key'];

const SOAP = [
  { key: 'S', labelAr: 'ذاتي (شكوى المريض)',  labelEn: 'Subjective',  placeholderAr: 'ما يشكو منه المريض…',       placeholderEn: "Patient's chief complaint…"       },
  { key: 'O', labelAr: 'موضوعي (النتائج)',     labelEn: 'Objective',   placeholderAr: 'النتائج والفحص السريري…',    placeholderEn: 'Examination findings…'             },
  { key: 'A', labelAr: 'التقييم',              labelEn: 'Assessment',  placeholderAr: 'التشخيص والتقييم السريري…',  placeholderEn: 'Clinical assessment…'             },
  { key: 'P', labelAr: 'الخطة العلاجية',       labelEn: 'Plan',        placeholderAr: 'خطة العلاج والإجراءات…',     placeholderEn: 'Treatment plan and next steps…'   },
] as const;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'outline'> = {
  completed:   'success',
  signed_off:  'success',
  in_progress: 'warning',
  draft:       'outline',
};

/* ── helpers ─────────────────────────────────────────────────────────── */

function buildVitalSigns(v: VitalFields): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    const n = parseFloat(val);
    if (val.trim() && !isNaN(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function vitalsFromRecord(rec: Record<string, unknown>): VitalFields {
  const get = (k: string) => (rec[k] !== undefined ? String(rec[k]) : '');
  return {
    systolic_bp:       get('systolic_bp'),
    diastolic_bp:      get('diastolic_bp'),
    heart_rate:        get('heart_rate'),
    temperature:       get('temperature'),
    oxygen_saturation: get('oxygen_saturation'),
    respiratory_rate:  get('respiratory_rate'),
    weight_kg:         get('weight_kg'),
    height_cm:         get('height_cm'),
  };
}

/* ── component ───────────────────────────────────────────────────────── */

export function EncounterDetailModal({ open, encounter, patientName, doctorName, onClose }: Props) {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();

  const [tab,          setTab]          = useState<TabKey>('notes');
  const [diagnosis,    setDiagnosis]    = useState('');
  const [soap,         setSoap]         = useState({ S: '', O: '', A: '', P: '' });
  const [vitals,       setVitals]       = useState<VitalFields>(EMPTY_VITALS);
  const [labOrders,    setLabOrders]    = useState<LabOrder[]>([]);
  const [newLabName,   setNewLabName]   = useState('');
  const [followUp,     setFollowUp]     = useState('');
  const [instructions, setInstructions] = useState('');
  const [followUpType, setFollowUpType] = useState('clinic');
  const [rxSaved,      setRxSaved]      = useState(false);
  const [localVersion, setLocalVersion] = useState(1);

  useEffect(() => {
    if (!encounter) return;
    setDiagnosis(encounter.diagnosisPrimary ?? '');
    try {
      const parsed = JSON.parse(encounter.clinicalNotes ?? '{}') as Record<string, string>;
      setSoap({ S: parsed.S ?? '', O: parsed.O ?? '', A: parsed.A ?? '', P: parsed.P ?? '' });
    } catch {
      setSoap({ S: encounter.clinicalNotes ?? '', O: '', A: '', P: '' });
    }
    setVitals(encounter.vitalSigns ? vitalsFromRecord(encounter.vitalSigns) : EMPTY_VITALS);
    setLabOrders(
      Array.isArray(encounter.labOrders)
        ? (encounter.labOrders as LabOrder[]).filter((l): l is LabOrder => !!l?.name)
        : [],
    );
    setFollowUp(encounter.followUpDate ?? '');
    setInstructions(encounter.followUpNotes ?? '');
    setLocalVersion(encounter.version);
    setRxSaved(false);
    setTab('notes');
  }, [encounter?.id]);

  /* PATCH → optional sign-off */
  const saveMutation = useMutation({
    mutationFn: async ({ signOff }: { signOff: boolean }) => {
      if (!encounter) return { newVersion: localVersion };
      const patchRes = await ehrApi.patch<{ success: boolean; data: { version: number } }>(
        `/encounters/${encounter.id}`,
        {
          version:          localVersion,
          diagnosisPrimary: diagnosis || undefined,
          clinicalNotes:    JSON.stringify(soap),
          vitalSigns:       buildVitalSigns(vitals),
          labOrders:        labOrders.length ? labOrders : undefined,
          followUpDate:     followUp || undefined,
          followUpNotes:    instructions || undefined,
          status:           signOff ? 'completed' : 'in_progress',
        },
      );
      const newVersion = patchRes.data.data.version;
      if (signOff) {
        await ehrApi.post(`/encounters/${encounter.id}/sign-off`, { version: newVersion });
      }
      return { newVersion };
    },
    onSuccess: ({ newVersion }) => {
      setLocalVersion(newVersion);
      void queryClient.invalidateQueries({ queryKey: ['encounters'] });
      onClose();
    },
  });

  /* lab helpers */
  function addLabPreset(name: string) {
    if (labOrders.some((l) => l.name === name)) return;
    setLabOrders((prev) => [...prev, { id: crypto.randomUUID(), name, urgent: false, status: 'ordered' }]);
  }

  function addCustomLab() {
    const name = newLabName.trim();
    if (!name || labOrders.some((l) => l.name === name)) { setNewLabName(''); return; }
    setLabOrders((prev) => [...prev, { id: crypto.randomUUID(), name, urgent: false, status: 'ordered' }]);
    setNewLabName('');
  }

  function cycleLabStatus(id: string) {
    const cycle: LabOrder['status'][] = ['ordered', 'collected', 'resulted'];
    setLabOrders((prev) => prev.map((l) =>
      l.id === id ? { ...l, status: cycle[(cycle.indexOf(l.status) + 1) % cycle.length] } : l,
    ));
  }

  function toggleLabUrgent(id: string) {
    setLabOrders((prev) => prev.map((l) => l.id === id ? { ...l, urgent: !l.urgent } : l));
  }

  function removeLabOrder(id: string) {
    setLabOrders((prev) => prev.filter((l) => l.id !== id));
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
              {encounter.status === 'signed_off'  ? t('موقَّع',  'Signed Off')  :
               encounter.status === 'completed'   ? t('مكتمل',  'Completed')   :
               encounter.status === 'in_progress' ? t('جارٍ',   'In Progress') :
                                                    t('مسودة',  'Draft')}
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
        <div className="flex border-b border-gray-100 dark:border-neutral-800 flex-shrink-0 px-6 overflow-x-auto">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                'py-2.5 px-1 me-5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
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

          {/* ── Vitals ── */}
          {tab === 'vitals' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-600" />
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('العلامات الحيوية', 'Vital Signs')}
                </span>
              </div>

              {/* Blood pressure */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {t('ضغط الدم (انقباضي / انبساطي)', 'Blood Pressure (Systolic / Diastolic)')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="60" max="300"
                    placeholder={t('انقباضي', 'Systolic')}
                    value={vitals.systolic_bp}
                    onChange={(e) => setVitals((v) => ({ ...v, systolic_bp: e.target.value }))}
                    disabled={isSigned}
                    className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:opacity-60"
                  />
                  <span className="text-gray-400 font-bold text-lg">/</span>
                  <input
                    type="number" min="30" max="200"
                    placeholder={t('انبساطي', 'Diastolic')}
                    value={vitals.diastolic_bp}
                    onChange={(e) => setVitals((v) => ({ ...v, diastolic_bp: e.target.value }))}
                    disabled={isSigned}
                    className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:opacity-60"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">mmHg</span>
                </div>
              </div>

              {/* Other vitals grid */}
              <div className="grid grid-cols-2 gap-3">
                {VITAL_GRID.map(({ key, labelEn, labelAr, unit, min, max }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {lang === 'ar' ? labelAr : labelEn}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={min} max={max}
                        value={vitals[key]}
                        onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))}
                        disabled={isSigned}
                        className="flex-1 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:opacity-60"
                      />
                      <span className="text-xs text-gray-400 w-9 text-right">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Lab Orders ── */}
          {tab === 'labs' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary-600" />
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('طلبات المختبر', 'Lab Orders')}
                </span>
              </div>

              {!isSigned && (
                <>
                  {/* Quick-add presets */}
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {t('إضافة سريعة:', 'Quick add:')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {LAB_PRESETS.map((name) => {
                        const added = labOrders.some((l) => l.name === name);
                        return (
                          <button
                            key={name}
                            onClick={() => addLabPreset(name)}
                            disabled={added}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                              added
                                ? 'border-primary-300 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 cursor-default'
                                : 'border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600',
                            )}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom input */}
                  <div className="flex gap-2">
                    <input
                      value={newLabName}
                      onChange={(e) => setNewLabName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomLab()}
                      placeholder={t('اسم فحص مخصص…', 'Custom test name…')}
                      className="flex-1 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
                    <Button variant="outline" size="sm" onClick={addCustomLab}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}

              {/* Orders list */}
              {labOrders.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  {t('لا توجد طلبات مختبر.', 'No lab orders yet.')}
                </div>
              ) : (
                <div className="space-y-2">
                  {labOrders.map((lab) => (
                    <div
                      key={lab.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {lab.name}
                        </span>
                        {lab.urgent && (
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">
                            {t('عاجل', 'Urgent')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => cycleLabStatus(lab.id)}
                          disabled={isSigned}
                          className="disabled:pointer-events-none"
                          title={t('انقر للتقدم في الحالة', 'Click to advance status')}
                        >
                          <Badge variant={LAB_STATUS_VARIANT[lab.status]}>
                            {lab.status === 'ordered'   ? t('مطلوب',    'Ordered')   :
                             lab.status === 'collected' ? t('جُمِع',    'Collected') :
                                                          t('النتيجة', 'Resulted')}
                          </Badge>
                        </button>
                        {!isSigned && (
                          <>
                            <button
                              onClick={() => toggleLabUrgent(lab.id)}
                              title={t('تعليم عاجل', 'Mark urgent')}
                              className={cn(
                                'text-xs px-1.5 py-0.5 rounded border font-bold transition-colors',
                                lab.urgent
                                  ? 'border-red-300 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                                  : 'border-gray-200 dark:border-neutral-600 text-gray-400 hover:text-red-500',
                              )}
                            >
                              !
                            </button>
                            <button
                              onClick={() => removeLabOrder(lab.id)}
                              className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Prescription ── */}
          {tab === 'rx' && isSigned && (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
              {t('هذه الحالة موقَّعة ولا يمكن إضافة وصفة جديدة.', 'This encounter is signed — no new prescriptions can be added.')}
            </p>
          )}
          {tab === 'rx' && !isSigned && rxSaved && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {t('تم حفظ الوصفة بنجاح', 'Prescription saved successfully')}
              </p>
              <Button variant="outline" size="sm" onClick={() => setRxSaved(false)}>
                {t('إضافة وصفة أخرى', 'Add another prescription')}
              </Button>
            </div>
          )}
          {tab === 'rx' && !isSigned && !rxSaved && (
            <PrescriptionForm
              encounterId={encounter.id}
              patientId={encounter.patientId}
              doctorId={encounter.doctorId}
              onSuccess={() => setRxSaved(true)}
              onCancel={() => setTab('notes')}
            />
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
              : saveMutation.isError
              ? t('فشل الحفظ. تحقق من الاتصال.', 'Save failed. Check connection.')
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
