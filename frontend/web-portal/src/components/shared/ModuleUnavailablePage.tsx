'use client';

import { Lock } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import type { ModuleId, SubscriptionTier } from '@fadl/types';
import { TIER_MODULES } from '@fadl/types';

const TIER_LABELS: Record<SubscriptionTier, { en: string; ar: string }> = {
  basic:    { en: 'Basic',    ar: 'أساسي' },
  standard: { en: 'Standard', ar: 'قياسي' },
  premium:  { en: 'Premium',  ar: 'متميز' },
};

const MODULE_LABELS: Record<ModuleId, { en: string; ar: string }> = {
  patients:     { en: 'Patient Management', ar: 'إدارة المرضى' },
  scheduling:   { en: 'Scheduling',         ar: 'الجدولة' },
  billing:      { en: 'Billing',            ar: 'الفواتير' },
  settlements:  { en: 'Settlements',        ar: 'التسويات' },
  ehr:          { en: 'Clinical Records',   ar: 'السجلات السريرية' },
  ai:           { en: 'AI Assistant',       ar: 'المساعد الذكي' },
  analytics:    { en: 'Analytics',          ar: 'الإحصائيات' },
  telehealth:   { en: 'Telehealth',         ar: 'الرعاية عن بُعد' },
  procurement:  { en: 'Procurement',        ar: 'المشتريات' },
  integrations: { en: 'Integrations',       ar: 'التكاملات' },
};

const NEXT_TIER: Record<SubscriptionTier, SubscriptionTier | null> = {
  basic:    'standard',
  standard: 'premium',
  premium:  null,
};

interface Props {
  moduleId: ModuleId;
}

export function ModuleUnavailablePage({ moduleId }: Props) {
  const { lang } = useLang();
  const { data } = useFeatureFlags();
  const tier = data?.tier ?? 'basic';
  const nextTier = NEXT_TIER[tier];
  const isRtl = lang === 'ar';

  const moduleLabel = MODULE_LABELS[moduleId]?.[lang] ?? moduleId;
  const tierLabel   = TIER_LABELS[tier][lang];
  const nextLabel   = nextTier ? TIER_LABELS[nextTier][lang] : null;

  const includedInNext = nextTier
    ? TIER_MODULES[nextTier].includes(moduleId)
    : false;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
           style={{ backgroundColor: 'rgba(220,38,38,0.12)' }}>
        <Lock className="w-8 h-8" style={{ color: '#DC2626' }} />
      </div>

      <h1 className="text-2xl font-semibold text-white mb-2" style={{ fontFamily: isRtl ? 'Tajawal, sans-serif' : 'Outfit, sans-serif' }}>
        {isRtl ? `${moduleLabel} غير مفعّل` : `${moduleLabel} Not Available`}
      </h1>

      <p className="text-slate-400 mb-1" style={{ fontFamily: isRtl ? 'IBM Plex Sans Arabic, sans-serif' : 'Manrope, sans-serif' }}>
        {isRtl
          ? `هذه الميزة غير متاحة في خطتك الحالية (${tierLabel}).`
          : `This feature is not included in your current plan (${tierLabel}).`}
      </p>

      {includedInNext && nextLabel && (
        <p className="text-sm mt-4 px-4 py-2 rounded-lg"
           style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626', fontFamily: isRtl ? 'Tajawal, sans-serif' : 'Outfit, sans-serif' }}>
          {isRtl
            ? `متاح في خطة ${nextLabel} والأعلى`
            : `Available on ${nextLabel} plan and above`}
        </p>
      )}

      <p className="text-xs text-slate-500 mt-6">
        {isRtl
          ? 'تواصل مع مزود الخدمة لترقية خطتك'
          : 'Contact your service provider to upgrade your plan'}
      </p>
    </div>
  );
}
