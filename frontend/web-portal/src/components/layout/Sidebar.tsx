'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, LogOut, HeartPulse, FileHeart, Bot,
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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { lang } = useLang();
  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
        active
          ? 'bg-primary-600 text-white shadow-glow-primary'
          : 'text-slate-400 hover:text-white hover:bg-white/10',
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 truncate">{lang === 'ar' ? item.labelAr : item.labelEn}</span>
      {item.badge && (
        <span className="ms-auto bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { lang, t } = useLang();
  const navGroups = getNavForRole(user?.role ?? 'receptionist');

  return (
    <aside className="flex flex-col w-64 min-h-screen flex-shrink-0 bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0">
          <HeartPulse className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm font-display leading-tight truncate">
            {t('فضل كلينك', 'Fadl Clinic')}
          </p>
          <p className="text-slate-400 text-xs truncate">
            {t('نظام الإدارة', 'Management System')}
          </p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {(group.groupAr ?? group.groupEn) && (
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
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
            {(lang === 'ar' ? user?.nameAr : user?.nameEn)?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {lang === 'ar' ? user?.nameAr : user?.nameEn}
            </p>
            <p className="text-slate-400 text-xs truncate capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
            title={t('تسجيل الخروج', 'Logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
