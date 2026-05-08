'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, LogOut, HeartPulse, FileHeart, Bot,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { getNavForRole, NavItem } from './nav-config';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, FileHeart, Bot,
};

const MIN_WIDTH  = 60;
const MAX_WIDTH  = 320;
const SNAP_FULL  = 256;
const COLLAPSED  = 68;
const STORAGE_KEY = 'fcms_sidebar_width';

function savedWidth(): number {
  if (typeof window === 'undefined') return SNAP_FULL;
  const v = localStorage.getItem(STORAGE_KEY);
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? SNAP_FULL : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const { lang } = useLang();
  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
  const label = lang === 'ar' ? item.labelAr : item.labelEn;
  return (
    <Link
      href={item.href}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150',
        collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5',
        active
          ? 'bg-primary-600 text-white shadow-glow-primary'
          : 'text-slate-400 hover:text-white hover:bg-white/10',
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {item.badge && (
            <span className="ms-auto bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname   = usePathname();
  const { user, logout } = useAuth();
  const { lang, t } = useLang();
  const navGroups  = getNavForRole(user?.role ?? 'receptionist');

  const [width, setWidth]         = useState(SNAP_FULL);
  const [snapping, setSnapping]   = useState(false);
  const dragging                  = useRef(false);
  const startX                    = useRef(0);
  const startW                    = useRef(SNAP_FULL);

  const collapsed = width <= COLLAPSED;

  useEffect(() => { setWidth(savedWidth()); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(width)); }, [width]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = width;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function move(ev: MouseEvent) {
      if (!dragging.current) return;
      const delta = lang === 'ar' ? startX.current - ev.clientX : ev.clientX - startX.current;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)));
    }
    function up() {
      dragging.current = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [width, lang]);

  function toggleCollapse() {
    setSnapping(true);
    setWidth(collapsed ? SNAP_FULL : MIN_WIDTH);
    setTimeout(() => setSnapping(false), 250);
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col min-h-screen flex-shrink-0 bg-sidebar select-none',
        snapping && 'transition-[width] duration-200 ease-out',
      )}
      style={{ width }}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 border-b border-white/10 py-6',
        collapsed ? 'justify-center px-2' : 'px-5',
      )}>
        <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0">
          <HeartPulse className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm font-display leading-tight truncate">
              {t('فضل كلينك', 'Fadl Clinic')}
            </p>
            <p className="text-slate-400 text-xs truncate">
              {t('نظام الإدارة', 'Management System')}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 py-4 space-y-5 overflow-y-auto overflow-x-hidden', collapsed ? 'px-1' : 'px-3')}>
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {!collapsed && (group.groupAr ?? group.groupEn) && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {lang === 'ar' ? group.groupAr : group.groupEn}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.key}
                  item={item}
                  active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className={cn('border-t border-white/10 py-4', collapsed ? 'px-1' : 'px-3')}>
        <div className={cn('flex items-center gap-3 rounded-lg', collapsed ? 'justify-center flex-col gap-1 py-2' : 'px-3 py-2.5')}>
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
            {(lang === 'ar' ? user?.nameAr : user?.nameEn)?.charAt(0) ?? '?'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {lang === 'ar' ? user?.nameAr : user?.nameEn}
              </p>
              <p className="text-slate-400 text-xs truncate capitalize">{user?.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
            title={t('تسجيل الخروج', 'Logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toggle collapse button */}
      <button
        onClick={toggleCollapse}
        className="absolute top-20 -end-3 z-20 w-6 h-6 rounded-full bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 flex items-center justify-center shadow-md hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors"
        title={collapsed ? t('توسيع', 'Expand') : t('طي', 'Collapse')}
      >
        {lang === 'ar'
          ? (collapsed ? <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" /> : <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />)
          : (collapsed ? <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" /> : <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />)
        }
      </button>

      {/* Drag handle */}
      <div
        onMouseDown={onHandleMouseDown}
        className="absolute inset-y-0 end-0 w-1.5 cursor-col-resize group z-10"
      >
        <div className="absolute inset-y-0 end-0 w-0.5 bg-transparent group-hover:bg-primary-500/50 transition-colors duration-150" />
      </div>
    </aside>
  );
}
