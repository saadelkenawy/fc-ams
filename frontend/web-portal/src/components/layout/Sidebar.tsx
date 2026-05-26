'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, LogOut, HeartPulse, FileHeart, Bot,
  ChevronLeft, ChevronRight, Share2, Plug, Package, Archive, Store, Bell, DoorOpen,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { getNavForRole, NavItem } from './nav-config';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, FileHeart, Bot, Share2, Plug, Package,
  Archive, Store, Bell, DoorOpen, UserPlus,
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

function NavLink({
  item, active, collapsed, onMobileClose,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onMobileClose?: () => void;
}) {
  const { lang } = useLang();
  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
  const label = lang === 'ar' ? item.labelAr : item.labelEn;
  return (
    <Link
      href={item.href}
      onClick={onMobileClose}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 overflow-hidden',
        collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5',
        active
          ? 'bg-white/[.08] text-white'
          : 'text-slate-400 hover:text-white hover:bg-white/10',
      )}
    >
      {active && <span className="absolute start-0 top-1 bottom-1 w-[3px] rounded-e-sm bg-primary-600" aria-hidden="true" />}
      <Icon className="w-4 h-4 flex-shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            className="flex-1 truncate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!collapsed && item.badge && (
          <motion.span
            className="ms-auto bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {item.badge}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname       = usePathname();
  const { user, logout } = useAuth();
  const { lang, t }    = useLang();
  const navGroups      = getNavForRole(user?.role ?? 'receptionist');

  const [width, setWidth]       = useState(SNAP_FULL);
  const [snapping, setSnapping] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragging  = useRef(false);
  const startX    = useRef(0);
  const startW    = useRef(SNAP_FULL);

  // On mobile the sidebar is always fully expanded
  const collapsed = !isMobile && width <= COLLAPSED;

  useEffect(() => { setWidth(savedWidth()); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(width)); }, [width]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  // Mobile: translate off-screen toward the start edge; desktop: no transform
  const mobileHiddenClass = lang === 'ar' ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            aria-hidden="true"
            onClick={onMobileClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

    <aside
      className={cn(
        'flex flex-col min-h-screen bg-sidebar select-none',
        // Mobile: fixed overlay
        'fixed inset-y-0 start-0 z-40',
        'transition-transform duration-200 ease-out',
        isMobile && !mobileOpen && mobileHiddenClass,
        // Desktop: static in normal flow, no translate, variable width
        'lg:static lg:translate-x-0 lg:z-auto lg:transition-none',
        !isMobile && snapping && 'lg:transition-[width] lg:duration-200 lg:ease-out',
      )}
      style={isMobile ? undefined : { width }}
    >
      {/* Logo card — white card on slate sidebar */}
      <div className={cn('pt-5 pb-4 border-b border-white/10', collapsed ? 'px-2' : 'px-4')}>
        <div className={cn(
          'logo-card bg-white rounded-xl flex items-center justify-center transition-all duration-200 shadow-2',
          collapsed ? 'p-2' : 'w-full px-4 py-2.5',
        )}>
          {collapsed ? (
            <HeartPulse className="w-6 h-6 text-primary-600 flex-shrink-0" />
          ) : (
            <img
              src="/images/logo-wordmark.png"
              alt="Fadl Clinic"
              className="logo-img h-7 w-auto object-contain"
            />
          )}
        </div>
        {!collapsed && (
          <p className="text-slate-400 text-[11px] text-center mt-2.5 font-medium tracking-wide uppercase">
            {lang === 'ar' ? 'نظام الإدارة' : 'Management System'}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav id="sidebar-nav" className={cn('flex-1 py-4 space-y-5 overflow-y-auto overflow-x-hidden', collapsed ? 'px-1' : 'px-3')}>
        {navGroups.map((group, gi) => (
          <div key={gi}>
            <AnimatePresence>
              {!collapsed && (group.groupAr ?? group.groupEn) && (
                <motion.p
                  className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  {lang === 'ar' ? group.groupAr : group.groupEn}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.key}
                  item={item}
                  active={pathname === item.href}
                  collapsed={collapsed}
                  onMobileClose={isMobile ? onMobileClose : undefined}
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
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="flex-1 min-w-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <p className="text-white text-sm font-medium truncate">
                  {lang === 'ar' ? user?.nameAr : user?.nameEn}
                </p>
                <p className="text-slate-400 text-xs truncate capitalize">{user?.role}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={logout}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
            title={t('تسجيل الخروج', 'Logout')}
            aria-label={t('تسجيل الخروج', 'Logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toggle collapse button — desktop only */}
      <button
        onClick={toggleCollapse}
        className="hidden lg:flex absolute top-20 -end-3 z-20 w-6 h-6 rounded-full bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 items-center justify-center shadow-md hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors"
        title={collapsed ? t('توسيع', 'Expand') : t('طي', 'Collapse')}
        aria-label={collapsed ? t('توسيع القائمة الجانبية', 'Expand sidebar') : t('طي القائمة الجانبية', 'Collapse sidebar')}
        aria-expanded={!collapsed}
        aria-controls="sidebar-nav"
      >
        {lang === 'ar'
          ? (collapsed ? <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" /> : <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />)
          : (collapsed ? <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" /> : <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />)
        }
      </button>

      {/* Drag handle — desktop only */}
      <div
        onMouseDown={onHandleMouseDown}
        className="hidden lg:block absolute inset-y-0 end-0 w-1.5 cursor-col-resize group z-10"
      >
        <div className="absolute inset-y-0 end-0 w-0.5 bg-transparent group-hover:bg-primary-500/50 transition-colors duration-150" />
      </div>
    </aside>
    </>
  );
}
