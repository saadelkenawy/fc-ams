'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, Stethoscope, LayoutDashboard, Calendar, Users, FileText, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePatients } from '@/hooks/usePatients';
import { useDoctors } from '@/hooks/useDoctors';
import type { Patient, Doctor } from '@fadl/types';

/* ── quick-nav pages ─────────────────────────────────────────────────── */

const NAV_PAGES = [
  { icon: LayoutDashboard, labelAr: 'الرئيسية',     labelEn: 'Dashboard',     path: '/'             },
  { icon: Calendar,        labelAr: 'المواعيد',      labelEn: 'Appointments',  path: '/appointments' },
  { icon: Users,           labelAr: 'المرضى',        labelEn: 'Patients',      path: '/patients'     },
  { icon: Stethoscope,     labelAr: 'الأطباء',       labelEn: 'Doctors',       path: '/doctors'      },
  { icon: FileText,        labelAr: 'الفواتير',      labelEn: 'Billing',       path: '/billing'      },
  { icon: FileText,        labelAr: 'التسويات',      labelEn: 'Settlements',   path: '/settlements'  },
] as const;

/* ── types ───────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
}

/* ── component ───────────────────────────────────────────────────────── */

export function GlobalSearchOverlay({ open, onClose }: Props) {
  const { lang, t } = useLang();
  const router = useRouter();

  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dq = useDebounce(query, 260);

  const trimmed = dq.trim();
  const enabled = trimmed.length >= 2;

  /* search queries */
  const { data: patientData, isFetching: pFetching } = usePatients(
    enabled ? { query: trimmed, limit: 5 } : {},
  );
  const { data: doctorData } = useDoctors({ limit: 500 });

  const patients: Patient[] = patientData?.data ?? [];
  const allDoctors: Doctor[] = doctorData?.data ?? [];
  const doctors = enabled
    ? allDoctors.filter((d) => {
        const name = (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).toLowerCase();
        return name.includes(trimmed.toLowerCase());
      }).slice(0, 4)
    : [];

  const filteredPages = NAV_PAGES.filter((p) =>
    !enabled ||
    (lang === 'ar' ? p.labelAr : p.labelEn).toLowerCase().includes(trimmed.toLowerCase()),
  );

  /* flat list for keyboard nav */
  type Item =
    | { kind: 'patient'; data: Patient }
    | { kind: 'doctor';  data: Doctor  }
    | { kind: 'page';    path: string; labelAr: string; labelEn: string };

  const items: Item[] = [
    ...patients.map((p) => ({ kind: 'patient' as const, data: p })),
    ...doctors.map( (d) => ({ kind: 'doctor'  as const, data: d })),
    ...filteredPages.map((p) => ({ kind: 'page' as const, path: p.path, labelAr: p.labelAr, labelEn: p.labelEn })),
  ];

  /* focus on open */
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  /* clamp active index */
  useEffect(() => {
    setActive(0);
  }, [dq]);

  const navigate = useCallback((item: Item) => {
    onClose();
    if (item.kind === 'patient') router.push(`/patients/${item.data.patientId}`);
    else if (item.kind === 'doctor')  router.push(`/doctors/${item.data.id}`);
    else router.push(item.path);
  }, [onClose, router]);

  /* keyboard handler */
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      navigate(items[active]);
    }
  }

  const hasResults = patients.length > 0 || doctors.length > 0 || filteredPages.length > 0;

  return (
    <AnimatePresence>
      {open && (
    /* backdrop */
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {/* panel */}
      <motion.div
        className="w-full max-w-xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ابحث عن مريض، طبيب، أو صفحة...', 'Search patients, doctors, or pages...')}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700">
              ESC
            </kbd>
          </div>
        </div>

        {/* results */}
        <div className="max-h-[55vh] overflow-y-auto py-2">
          {/* loading */}
          {enabled && pFetching && patients.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 text-center">
              {t('جارٍ البحث...', 'Searching...')}
            </p>
          )}

          {/* patients section */}
          {patients.length > 0 && (
            <Section label={t('المرضى', 'Patients')}>
              {patients.map((p, i) => {
                const name = lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn;
                const idx = items.findIndex((it) => it.kind === 'patient' && it.data.patientId === p.patientId);
                return (
                  <ResultRow
                    key={p.patientId}
                    icon={<User className="w-4 h-4 text-primary-600 dark:text-primary-400" />}
                    iconBg="bg-primary-100 dark:bg-primary-900/30"
                    primary={name}
                    secondary={`#${p.patientId.slice(-8).toUpperCase()}`}
                    active={active === idx}
                    onHover={() => setActive(idx)}
                    onClick={() => navigate({ kind: 'patient', data: p })}
                  />
                );
              })}
            </Section>
          )}

          {/* doctors section */}
          {doctors.length > 0 && (
            <Section label={t('الأطباء', 'Doctors')}>
              {doctors.map((d) => {
                const name = lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn;
                const idx  = items.findIndex((it) => it.kind === 'doctor' && it.data.id === d.id);
                return (
                  <ResultRow
                    key={d.id}
                    icon={<Stethoscope className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                    iconBg="bg-emerald-100 dark:bg-emerald-900/30"
                    primary={name}
                    secondary={`#${d.id.slice(-8).toUpperCase()}`}
                    active={active === idx}
                    onHover={() => setActive(idx)}
                    onClick={() => navigate({ kind: 'doctor', data: d })}
                  />
                );
              })}
            </Section>
          )}

          {/* pages section */}
          {filteredPages.length > 0 && (
            <Section label={t('الصفحات', 'Pages')}>
              {filteredPages.map((p) => {
                const Icon = p.icon;
                const idx  = items.findIndex((it) => it.kind === 'page' && it.path === p.path);
                return (
                  <ResultRow
                    key={p.path}
                    icon={<Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                    iconBg="bg-gray-100 dark:bg-neutral-800"
                    primary={lang === 'ar' ? p.labelAr : p.labelEn}
                    secondary={p.path}
                    active={active === idx}
                    onHover={() => setActive(idx)}
                    onClick={() => navigate({ kind: 'page', path: p.path, labelAr: p.labelAr, labelEn: p.labelEn })}
                    rightIcon={<ArrowRight className="w-3 h-3" />}
                  />
                );
              })}
            </Section>
          )}

          {/* empty */}
          {enabled && !pFetching && !hasResults && (
            <div className="px-4 py-10 text-center">
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t(`لا نتائج لـ "${trimmed}"`, `No results for "${trimmed}"`)}
              </p>
            </div>
          )}

          {!enabled && !query && (
            <div className="px-4 py-4">
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
                {t('انتقال سريع', 'Quick Navigation')}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {NAV_PAGES.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.path}
                      onClick={() => { onClose(); router.push(p.path); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors text-start"
                    >
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      {lang === 'ar' ? p.labelAr : p.labelEn}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-neutral-800 flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
          <span><kbd className="font-mono">↑↓</kbd> {t('تنقل', 'navigate')}</span>
          <span><kbd className="font-mono">↵</kbd> {t('انتقل', 'go')}</span>
          <span><kbd className="font-mono">esc</kbd> {t('إغلاق', 'close')}</span>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── sub-components ──────────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  icon, iconBg, primary, secondary, active, onHover, onClick, rightIcon,
}: {
  icon: React.ReactNode;
  iconBg: string;
  primary: string;
  secondary: string;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  rightIcon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors',
        active
          ? 'bg-primary-50 dark:bg-primary-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-neutral-800/50',
      )}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{primary}</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">{secondary}</p>
      </div>
      {rightIcon && (
        <span className={cn('text-gray-300 dark:text-gray-600', active && 'text-primary-400')}>
          {rightIcon}
        </span>
      )}
    </button>
  );
}
