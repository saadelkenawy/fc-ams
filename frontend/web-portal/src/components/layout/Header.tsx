'use client';

import { Bell, Search, Sun, Moon, Globe, LayoutGrid, Minus, Plus, X, User, CheckCircle2, AlertCircle, Clock, MessageSquare, Menu } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/Button';
import { usePatients } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { notificationApi } from '@/lib/api';
import type { Patient } from '@fadl/types';

const DROPDOWN_EASE = [0.25, 0.46, 0.45, 0.94] as const;
const dropdownVariants = {
  hidden:  { opacity: 0, y: -8, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: -8, scale: 0.97 },
} as const;
const dropdownTransition = { duration: 0.18, ease: DROPDOWN_EASE } as const;

// ─── Notification types ───────────────────────────────────────────────────────

interface NotifItem {
  id: string;
  channel: string;
  recipientType: string;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  createdAt: string;
}

const NOTIF_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  sent:      CheckCircle2,
  delivered: CheckCircle2,
  failed:    AlertCircle,
  queued:    Clock,
  cancelled: X,
};

const NOTIF_COLOR: Record<string, string> = {
  sent:      'text-emerald-500',
  delivered: 'text-emerald-600',
  failed:    'text-red-500',
  queued:    'text-amber-500',
  cancelled: 'text-gray-400',
};

function useRecentNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications-bell'],
    queryFn: async () => {
      const { data } = await notificationApi.get<{ data: NotifItem[]; total: number }>(
        '/notifications?limit=8',
      );
      return data;
    },
    enabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: false,
  });
}

// ─── Bell + dropdown ──────────────────────────────────────────────────────────

function NotificationBell() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string>(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('fcms_notif_seen') ?? new Date(0).toISOString())
      : new Date(0).toISOString(),
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const canSee = user?.role === 'admin' || user?.role === 'receptionist' || user?.role === 'finance';
  const { data } = useRecentNotifications(canSee);

  const notifications: NotifItem[] = data?.data ?? [];
  const unseen = notifications.filter((n) => n.createdAt > seenAt).length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen((o) => !o);
    if (!open) {
      const now = new Date().toISOString();
      setSeenAt(now);
      localStorage.setItem('fcms_notif_seen', now);
    }
  }

  function formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('الآن', 'Just now');
    if (mins < 60) return lang === 'ar' ? `${mins} د` : `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return lang === 'ar' ? `${hrs} س` : `${hrs}h`;
    return lang === 'ar' ? `${Math.floor(hrs / 24)} ي` : `${Math.floor(hrs / 24)}d`;
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 me-2"
        onClick={handleOpen}
        aria-label={t('الإشعارات', 'Notifications')}
      >
        <Bell className="w-4 h-4" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 bg-primary-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 animate-badge-pop">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-10 end-0 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-gray-100 dark:border-neutral-700 overflow-hidden"
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={dropdownTransition}
          >
            <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-700 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('الإشعارات', 'Notifications')}
              </p>
              {data?.total !== undefined && (
                <span className="text-xs text-gray-400">{data.total} {t('إجمالي', 'total')}</span>
              )}
            </div>

            {notifications.length === 0 ? (
              <motion.div
                className="px-4 py-8 text-center"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.18, ease: DROPDOWN_EASE }}
              >
                <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('لا توجد إشعارات', 'No notifications')}</p>
              </motion.div>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-neutral-700 max-h-80 overflow-y-auto list-none" role="list" aria-label={t('قائمة الإشعارات', 'Notification list')}>
                {notifications.map((n, idx) => {
                  const Icon = NOTIF_ICON[n.status] ?? Bell;
                  const isNew = n.createdAt > seenAt;
                  return (
                    <motion.li
                      key={n.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 + idx * 0.04, duration: 0.16, ease: DROPDOWN_EASE }}
                    >
                      <button
                        className={cn(
                          'w-full px-4 py-3 flex gap-3 items-start transition-colors text-start cursor-pointer',
                          isNew ? 'bg-primary-50/50 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-neutral-700/40',
                        )}
                        aria-label={`${n.body} — ${n.channel} — ${formatRelative(n.createdAt)}${isNew ? ` — ${t('جديد', 'new')}` : ''}`}
                      >
                        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', NOTIF_COLOR[n.status] ?? 'text-gray-400')} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2">{n.body}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-400 capitalize">{n.channel}</span>
                            <span className="text-[10px] text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
                            <span className="text-[10px] text-gray-400">{formatRelative(n.createdAt)}</span>
                          </div>
                        </div>
                        {isNew && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" aria-hidden="true" />}
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            )}

            {!canSee && (
              <div className="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                {t('غير متاح لدورك', 'Not available for your role')}
              </div>
            )}

            {/* Footer */}
            {canSee && notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-100 dark:border-neutral-700 flex items-center justify-between">
                <button
                  onClick={() => {
                    const now = new Date().toISOString();
                    setSeenAt(now);
                    localStorage.setItem('fcms_notif_seen', now);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
                >
                  {t('تعليم الكل كمقروء', 'Mark all as read')}
                </button>
                <span className="text-xs text-gray-300 dark:text-gray-600">{data?.total ?? 0} {t('إجمالي', 'total')}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type Density = 'compact' | 'comfortable' | 'spacious';
const DENSITIES: { key: Density; labelAr: string; labelEn: string }[] = [
  { key: 'compact',     labelAr: 'مضغوط',    labelEn: 'Compact'     },
  { key: 'comfortable', labelAr: 'عادي',      labelEn: 'Comfortable' },
  { key: 'spacious',    labelAr: 'واسع',      labelEn: 'Spacious'    },
];
const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
type TextSize = typeof TEXT_SIZES[number];

const DENSITY_KEY = 'fadl_density';

function QuickSearch({ onOpenGlobal }: { onOpenGlobal?: () => void }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [value, setValue]           = useState('');
  const [open, setOpen]             = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const dq       = useDebounce(value, 280);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const { data, isFetching } = usePatients(
    dq.trim().length >= 2 ? { query: dq.trim(), limit: 6 } : {},
  );
  const results: Patient[] = data?.data ?? [];

  // total navigable items = results + optional "view all" row
  const totalItems = results.length + (results.length > 0 ? 1 : 0);

  // reset active index when results change
  useEffect(() => { setActiveIdx(-1); }, [dq]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function handleSelect(patient: Patient) {
    setOpen(false);
    setActiveIdx(-1);
    setValue('');
    router.push(`/patients/${patient.patientId}`);
  }

  function handleViewAll() {
    setOpen(false);
    setActiveIdx(-1);
    router.push(`/patients?query=${encodeURIComponent(value.trim())}`);
    setValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || totalItems === 0) {
      if (e.key === 'Escape') { setOpen(false); return; }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
      if (activeIdx <= 0) inputRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < results.length) {
        handleSelect(results[activeIdx]);
      } else if (activeIdx === results.length) {
        handleViewAll();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  const showDropdown = open && dq.trim().length >= 2;
  const listboxId = 'quick-search-listbox';

  return (
    <div ref={wrapRef} className="flex-1 max-w-xs relative">
      <div className="relative">
        <Search className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none start-2.5" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeIdx >= 0 ? `qsr-${activeIdx}` : undefined}
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={() => { if (dq.trim().length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={t('بحث سريع...', 'Quick search...')}
          className={cn(
            'w-full h-8 text-xs bg-white/80 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-full',
            'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1 focus:border-primary-400',
            'text-gray-800 dark:text-gray-100 placeholder:text-gray-400 transition-colors',
            'ps-8 pe-16',
          )}
        />
        {!value && onOpenGlobal && (
          <button
            onClick={onOpenGlobal}
            className="absolute top-1/2 -translate-y-1/2 end-2 flex items-center gap-0.5"
            tabIndex={-1}
            aria-hidden="true"
          >
            <kbd className="px-1 py-0.5 rounded text-[9px] font-mono text-gray-400 bg-gray-100 dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 leading-none">⌘K</kbd>
          </button>
        )}
        {value && (
          <button
            onClick={() => { setValue(''); setOpen(false); setActiveIdx(-1); }}
            className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 end-2"
            aria-label={t('مسح البحث', 'Clear search')}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <AnimatePresence>
      {showDropdown && (
        <motion.div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={t('نتائج البحث', 'Search results')}
          className="absolute top-10 inset-x-0 z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-gray-100 dark:border-neutral-700 overflow-hidden max-h-72 overflow-y-auto"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: DROPDOWN_EASE }}
        >
          {isFetching && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400 text-center" role="status" aria-live="polite">
              {t('جارٍ البحث...', 'Searching...')}
            </div>
          )}

          {!isFetching && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400 text-center" role="status" aria-live="polite">
              {t('لا توجد نتائج', 'No results found')}
            </div>
          )}

          {results.map((p, i) => {
            const name = lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn;
            const isActive = activeIdx === i;
            return (
              <button
                key={p.patientId}
                id={`qsr-${i}`}
                data-idx={i}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(p)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors text-start',
                  isActive ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-neutral-700',
                )}
              >
                <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <User className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono" dir="ltr">
                    {p.patientId.slice(-8).toUpperCase()}
                  </p>
                </div>
              </button>
            );
          })}

          {results.length > 0 && (
            <button
              id={`qsr-${results.length}`}
              data-idx={results.length}
              role="option"
              aria-selected={activeIdx === results.length}
              onClick={handleViewAll}
              className={cn(
                'w-full px-3.5 py-2 text-xs text-primary-600 dark:text-primary-400 border-t border-gray-100 dark:border-neutral-700 transition-colors font-medium',
                activeIdx === results.length
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:bg-primary-50 dark:hover:bg-primary-900/20',
              )}
            >
              {t(`عرض كل النتائج لـ "${dq}"`, `View all results for "${dq}"`)}
            </button>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

interface HeaderProps {
  onMobileMenuToggle: () => void;
  onSearchOpen?: () => void;
}

export function Header({ onMobileMenuToggle, onSearchOpen }: HeaderProps) {
  const { lang, toggle, t }     = useLang();
  const { user }                = useAuth();
  const { theme, setTheme }     = useTheme();
  const [density, setDensity]   = useState<Density>('comfortable');
  const [textSize, setTextSize] = useState<TextSize>('md');
  const [showDensity, setShowDensity] = useState(false);

  // Restore persisted density + text size on mount
  useEffect(() => {
    const storedDensity = localStorage.getItem(DENSITY_KEY) as Density | null;
    if (storedDensity && DENSITIES.some((d) => d.key === storedDensity)) {
      document.documentElement.setAttribute('data-density', storedDensity);
      setDensity(storedDensity);
    }
    const storedSize = localStorage.getItem('fadl_text_size') as TextSize | null;
    if (storedSize && (TEXT_SIZES as readonly string[]).includes(storedSize)) {
      document.documentElement.setAttribute('data-text-size', storedSize);
      setTextSize(storedSize);
    }
  }, []);

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  const applyDensity = useCallback((d: Density) => {
    document.documentElement.setAttribute('data-density', d);
    localStorage.setItem(DENSITY_KEY, d);
    setDensity(d);
    setShowDensity(false);
  }, []);

  function zoomOut() {
    const idx = TEXT_SIZES.indexOf(textSize);
    if (idx > 0) {
      const next = TEXT_SIZES[idx - 1];
      document.documentElement.setAttribute('data-text-size', next);
      localStorage.setItem('fadl_text_size', next);
      setTextSize(next);
    }
  }

  function zoomIn() {
    const idx = TEXT_SIZES.indexOf(textSize);
    if (idx < TEXT_SIZES.length - 1) {
      const next = TEXT_SIZES[idx + 1];
      document.documentElement.setAttribute('data-text-size', next);
      localStorage.setItem('fadl_text_size', next);
      setTextSize(next);
    }
  }

  const userName = lang === 'ar' ? user?.nameAr : user?.nameEn;

  return (
    <header className="sticky top-0 z-20 h-14 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border-b border-gray-200/70 dark:border-neutral-800 flex items-center px-4 gap-3 flex-shrink-0 transition-colors duration-200">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
        aria-label={t('فتح القائمة', 'Open menu')}
      >
        <Menu className="w-5 h-5" />
      </button>

      <QuickSearch onOpenGlobal={onSearchOpen} />

      <div className="flex items-center gap-1 ms-auto">
        {/* Display settings — density + font size, always visible */}
        <div className="relative me-1">
          <button
            onClick={() => setShowDensity((s) => !s)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors text-xs font-medium"
            aria-label={t('إعدادات العرض', 'Display settings')}
            aria-expanded={showDensity}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(DENSITIES.find((d) => d.key === density)!.labelAr, DENSITIES.find((d) => d.key === density)!.labelEn)}</span>
          </button>
          <AnimatePresence>
          {showDensity && (
            <motion.div
              className="absolute top-10 end-0 z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-700 overflow-hidden min-w-[180px]"
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={dropdownTransition}
            >
              {/* Density section */}
              <div className="px-3 pt-2.5 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                  {t('كثافة العرض', 'Density')}
                </p>
                {DENSITIES.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => applyDensity(d.key)}
                    className={cn(
                      'w-full text-start px-3 py-2 text-sm rounded-lg transition-colors',
                      density === d.key
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700',
                    )}
                  >
                    {lang === 'ar' ? d.labelAr : d.labelEn}
                  </button>
                ))}
              </div>
              {/* Font size section */}
              <div className="px-3 pt-1 pb-2.5 border-t border-gray-100 dark:border-neutral-700 mt-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                  {t('حجم النص', 'Text Size')}
                </p>
                <div className="flex items-center gap-0 bg-gray-100 dark:bg-neutral-700 rounded-lg overflow-hidden">
                  <button
                    onClick={zoomOut}
                    disabled={textSize === 'sm'}
                    className="flex-1 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                    aria-label={t('تصغير النص', 'Decrease font size')}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-3 text-xs font-mono text-gray-600 dark:text-gray-300 select-none border-x border-gray-200 dark:border-neutral-600">
                    {textSize.toUpperCase()}
                  </span>
                  <button
                    onClick={zoomIn}
                    disabled={textSize === 'xl'}
                    className="flex-1 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                    aria-label={t('تكبير النص', 'Increase font size')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Language toggle */}
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('English', 'عربي')} className="h-9 w-9">
          <Globe className="w-4 h-4" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost" size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? t('وضع النهار', 'Light mode') : t('وضع الليل', 'Dark mode')}
          className="h-9 w-9"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <NotificationBell />

        {/* User pill */}
        {userName && (
          <div className="flex items-center gap-2.5 ps-3 border-s border-gray-200 dark:border-neutral-700">
            <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {userName.charAt(0)}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-none">{userName}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 capitalize leading-none mt-0.5">{user?.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
