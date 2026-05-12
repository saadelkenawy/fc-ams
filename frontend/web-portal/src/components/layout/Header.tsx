'use client';

import { Bell, Search, Sun, Moon, Globe, LayoutGrid, Minus, Plus, X, User, CheckCircle2, AlertCircle, Clock, MessageSquare, Menu } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { usePatients } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { notificationApi } from '@/lib/api';
import type { Patient } from '@fadl/types';

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
        className="relative h-8 w-8 me-2"
        onClick={handleOpen}
        title={t('الإشعارات', 'Notifications')}
      >
        <Bell className="w-4 h-4" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 bg-primary-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute top-10 end-0 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-gray-100 dark:border-neutral-700 overflow-hidden animate-slide-down">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-700 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('الإشعارات', 'Notifications')}
            </p>
            {data?.total !== undefined && (
              <span className="text-xs text-gray-400">{data.total} {t('إجمالي', 'total')}</span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">{t('لا توجد إشعارات', 'No notifications')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-neutral-700 max-h-80 overflow-y-auto">
              {notifications.map((n) => {
                const Icon = NOTIF_ICON[n.status] ?? Bell;
                const isNew = n.createdAt > seenAt;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 flex gap-3 items-start transition-colors',
                      isNew ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-neutral-700/40',
                    )}
                  >
                    <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', NOTIF_COLOR[n.status] ?? 'text-gray-400')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-400 capitalize">{n.channel}</span>
                        <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-[10px] text-gray-400">{formatRelative(n.createdAt)}</span>
                      </div>
                    </div>
                    {isNew && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" />}
                  </div>
                );
              })}
            </div>
          )}

          {!canSee && (
            <div className="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
              {t('غير متاح لدورك', 'Not available for your role')}
            </div>
          )}
        </div>
      )}
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

function QuickSearch() {
  const { lang, t } = useLang();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounce(value, 280);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = usePatients(
    dq.trim().length >= 2 ? { query: dq.trim(), limit: 6 } : {},
  );
  const results: Patient[] = data?.data ?? [];

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(patient: Patient) {
    setOpen(false);
    setValue('');
    router.push(`/patients/${patient.patientId}`);
  }

  function handleViewAll() {
    setOpen(false);
    router.push(`/patients?query=${encodeURIComponent(value.trim())}`);
    setValue('');
  }

  const showDropdown = open && dq.trim().length >= 2;

  return (
    <div ref={wrapRef} className="flex-1 max-w-xs relative">
      <div className="relative">
        <Search className={cn(
          'absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none',
          lang === 'ar' ? 'right-2.5' : 'left-2.5',
        )} />
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => { if (dq.trim().length >= 2) setOpen(true); }}
          placeholder={t('بحث سريع...', 'Quick search...')}
          className={cn(
            'w-full h-8 text-xs bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg',
            'focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-400',
            'text-gray-800 dark:text-gray-100 placeholder:text-gray-400 transition-colors',
            lang === 'ar' ? 'pr-8 pl-7 text-right' : 'pl-8 pr-7',
          )}
        />
        {value && (
          <button
            onClick={() => { setValue(''); setOpen(false); }}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600',
              lang === 'ar' ? 'left-2' : 'right-2',
            )}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-10 inset-x-0 z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-gray-100 dark:border-neutral-700 overflow-hidden animate-slide-down">
          {isFetching && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">
              {t('جارٍ البحث...', 'Searching...')}
            </div>
          )}

          {!isFetching && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">
              {t('لا توجد نتائج', 'No results found')}
            </div>
          )}

          {results.map((p) => {
            const name = lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn;
            return (
              <button
                key={p.patientId}
                onClick={() => handleSelect(p)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors text-start"
              >
                <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
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
              onClick={handleViewAll}
              className="w-full px-3.5 py-2 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 border-t border-gray-100 dark:border-neutral-700 transition-colors font-medium"
            >
              {t(`عرض كل النتائج لـ "${dq}"`, `View all results for "${dq}"`)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface HeaderProps {
  onMobileMenuToggle: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const { lang, toggle, t }     = useLang();
  const { user }                = useAuth();
  const [dark, setDark]         = useState(false);
  const [density, setDensity]   = useState<Density>('comfortable');
  const [textSize, setTextSize] = useState<TextSize>('md');
  const [showDensity, setShowDensity] = useState(false);

  function toggleTheme() {
    setDark((d) => {
      document.documentElement.setAttribute('data-theme', d ? 'light' : 'dark');
      return !d;
    });
  }

  const applyDensity = useCallback((d: Density) => {
    document.documentElement.setAttribute('data-density', d);
    setDensity(d);
    setShowDensity(false);
  }, []);

  function zoomOut() {
    const idx = TEXT_SIZES.indexOf(textSize);
    if (idx > 0) {
      const next = TEXT_SIZES[idx - 1];
      document.documentElement.setAttribute('data-text-size', next);
      setTextSize(next);
    }
  }

  function zoomIn() {
    const idx = TEXT_SIZES.indexOf(textSize);
    if (idx < TEXT_SIZES.length - 1) {
      const next = TEXT_SIZES[idx + 1];
      document.documentElement.setAttribute('data-text-size', next);
      setTextSize(next);
    }
  }

  const userName = lang === 'ar' ? user?.nameAr : user?.nameEn;

  return (
    <header className="h-14 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 flex items-center px-4 gap-3 flex-shrink-0 transition-colors duration-200">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
        aria-label={t('فتح القائمة', 'Open menu')}
      >
        <Menu className="w-5 h-5" />
      </button>

      <QuickSearch />

      <div className="flex items-center gap-1 ms-auto">
        {/* Zoom controls — hidden below sm to preserve header space */}
        <div className="hidden sm:flex items-center gap-0 bg-gray-100 dark:bg-neutral-800 rounded-lg overflow-hidden me-1">
          <button
            onClick={zoomOut}
            disabled={textSize === 'sm'}
            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            title={t('تصغير النص', 'Decrease font')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-xs font-mono text-gray-600 dark:text-gray-300 select-none border-x border-gray-200 dark:border-neutral-700">{textSize.toUpperCase()}</span>
          <button
            onClick={zoomIn}
            disabled={textSize === 'xl'}
            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            title={t('تكبير النص', 'Increase font')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Density picker */}
        <div className="relative me-1">
          <button
            onClick={() => setShowDensity((s) => !s)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors text-xs font-medium"
            title={t('كثافة العرض', 'Display density')}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(DENSITIES.find((d) => d.key === density)!.labelAr, DENSITIES.find((d) => d.key === density)!.labelEn)}</span>
          </button>
          {showDensity && (
            <div className="absolute top-10 end-0 z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-700 overflow-hidden min-w-[140px] animate-slide-down">
              {DENSITIES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => applyDensity(d.key)}
                  className={cn(
                    'w-full text-start px-4 py-2.5 text-sm transition-colors',
                    density === d.key
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700',
                  )}
                >
                  {lang === 'ar' ? d.labelAr : d.labelEn}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language toggle */}
        <Button variant="ghost" size="icon" onClick={toggle} title={t('English', 'عربي')} className="h-8 w-8">
          <Globe className="w-4 h-4" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost" size="icon"
          onClick={toggleTheme}
          title={dark ? t('وضع النهار', 'Light mode') : t('وضع الليل', 'Dark mode')}
          className="h-8 w-8"
        >
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <NotificationBell />

        {/* User pill */}
        {userName && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-gray-200 dark:border-neutral-700">
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
