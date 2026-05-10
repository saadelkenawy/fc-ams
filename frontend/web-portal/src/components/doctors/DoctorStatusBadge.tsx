'use client';

import { useState, useRef, useEffect } from 'react';
import { Activity, AlertCircle, Navigation, CalendarOff, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctorStatus, useChangeDoctorStatus } from '@/hooks/useDoctors';
import type { DoctorStatus } from '@fadl/types';

const STATUS_CONFIG: Record<DoctorStatus, {
  labelAr: string; labelEn: string;
  icon: typeof Activity; bg: string; text: string; dot: string;
}> = {
  active:      { labelAr: 'متواجد',      labelEn: 'Active',      icon: Activity,     bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  on_his_way:  { labelAr: 'في الطريق',   labelEn: 'On His Way',  icon: Navigation,   bg: 'bg-amber-100 dark:bg-amber-950/40',   text: 'text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500'   },
  absent:      { labelAr: 'غائب',         labelEn: 'Absent',      icon: AlertCircle,  bg: 'bg-red-100 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500'     },
  day_off:     { labelAr: 'إجازة',        labelEn: 'Day Off',     icon: CalendarOff,  bg: 'bg-gray-100 dark:bg-neutral-800/40',  text: 'text-gray-600 dark:text-gray-400',     dot: 'bg-gray-400'    },
};

const ALL_STATUSES: DoctorStatus[] = ['active', 'on_his_way', 'absent', 'day_off'];

interface DoctorStatusBadgeProps {
  doctorId: string;
  editable?: boolean;
  size?: 'sm' | 'md';
}

export function DoctorStatusBadge({ doctorId, editable = false, size = 'md' }: DoctorStatusBadgeProps) {
  const { lang, t } = useLang();
  const { data } = useDoctorStatus(doctorId);
  const changeStatus = useChangeDoctorStatus(doctorId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const status = data?.status ?? 'active';
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  function handleChange(newStatus: DoctorStatus) {
    changeStatus.mutate({ status: newStatus, note: note.trim() || undefined }, {
      onSuccess: () => { setOpen(false); setNote(''); },
    });
  }

  const badge = (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      cfg.bg, cfg.text,
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
    )}>
      <span className={cn('rounded-full', cfg.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {lang === 'ar' ? cfg.labelAr : cfg.labelEn}
      {editable && <ChevronDown className={size === 'sm' ? 'w-2.5 h-2.5 ms-0.5' : 'w-3 h-3 ms-0.5'} />}
    </span>
  );

  if (!editable) return badge;

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen((p) => !p)}>{badge}</button>
      {open && (
        <div className="absolute z-50 top-full mt-1 start-0 w-56 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 shadow-lg p-2">
          <p className="text-[10px] text-gray-400 px-2 mb-1 uppercase tracking-wide">{t('تغيير الحالة', 'Change status')}</p>
          <div className="space-y-0.5">
            {ALL_STATUSES.map((s) => {
              const c = STATUS_CONFIG[s];
              const SI = c.icon;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleChange(s)}
                  disabled={changeStatus.isPending || s === status}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all',
                    s === status
                      ? cn(c.bg, c.text, 'font-medium')
                      : 'hover:bg-gray-50 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300',
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', c.dot)} />
                  <SI className="w-3.5 h-3.5" />
                  {lang === 'ar' ? c.labelAr : c.labelEn}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-neutral-700">
            <input
              className="w-full h-8 text-xs rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-2 placeholder:text-gray-400"
              placeholder={t('ملاحظة (اختياري)', 'Note (optional)')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
