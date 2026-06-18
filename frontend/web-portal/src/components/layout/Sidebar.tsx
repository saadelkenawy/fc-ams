'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CSidebar, CSidebarHeader, CSidebarBrand, CSidebarNav, CSidebarFooter,
  CSidebarToggler, CNavTitle, CNavItem, CNavLink, CBadge,
} from '@coreui/react';
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, LogOut, HeartPulse, FileHeart, Bot,
  Share2, Plug, Package, Archive, Store, Bell, DoorOpen,
  UserPlus, Pill, Monitor,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { getNavForRole } from './nav-config';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  LayoutDashboard, Users, CalendarDays, Stethoscope, Receipt,
  Banknote, BarChart3, FileText, Clipboard, Settings, Zap,
  List, CreditCard, TrendingUp, Home, FileHeart, Bot, Share2, Plug, Package,
  Archive, Store, Bell, DoorOpen, UserPlus, Pill, Monitor,
};

interface SidebarProps {
  /** Visibility — true shows the sidebar (in-flow on desktop, drawer on mobile).
      CoreUI routes this to its desktop/mobile buckets internally and auto-closes
      the mobile drawer on nav click / outside click. We intentionally do NOT
      bind CoreUI's onVisibleChange to our state: it fires with inViewport on
      mount (false during hydration) which would re-hide the sidebar. */
  visible: boolean;
  /** Desktop collapsed-to-icons state (hover-expands via CoreUI `unfoldable`). */
  unfoldable: boolean;
  onUnfoldableToggle: () => void;
}

export function Sidebar({ visible, unfoldable, onUnfoldableToggle }: SidebarProps) {
  const pathname           = usePathname();
  const { user, logout }   = useAuth();
  const { lang, t }        = useLang();
  const navGroups          = getNavForRole(user?.role ?? 'receptionist');
  const userName           = lang === 'ar' ? user?.nameAr : user?.nameEn;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  return (
    <CSidebar
      className="border-end"
      colorScheme="dark"
      placement="start"
      unfoldable={unfoldable}
      visible={visible}
    >
      <CSidebarHeader className="border-bottom justify-content-center">
        <CSidebarBrand as={Link} href="/">
          <Image
            src="/images/logo-dark-transparent.png"
            alt="Fadl Clinic"
            width={150}
            height={34}
            className="sidebar-brand-full"
            style={{ height: 32, width: 'auto', objectFit: 'contain' }}
            priority
          />
          <HeartPulse className="sidebar-brand-narrow" style={{ width: 24, height: 24 }} />
        </CSidebarBrand>
      </CSidebarHeader>

      <CSidebarNav>
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {(group.groupAr ?? group.groupEn) && (
              <CNavTitle>{lang === 'ar' ? group.groupAr : group.groupEn}</CNavTitle>
            )}
            {group.items.map((item) => {
              const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
              const label = lang === 'ar' ? item.labelAr : item.labelEn;
              return (
                <CNavItem key={item.key}>
                  <CNavLink
                    as={Link}
                    href={item.href}
                    active={isActive(item.href)}
                  >
                    <Icon className="nav-icon" style={{ width: 18, height: 18 }} />
                    {label}
                    {item.badge && (
                      <CBadge color="primary" className="ms-auto">{item.badge}</CBadge>
                    )}
                  </CNavLink>
                </CNavItem>
              );
            })}
          </div>
        ))}
      </CSidebarNav>

      <CSidebarFooter className="border-top d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2 overflow-hidden">
          <div
            className="d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle text-white fw-bold"
            style={{ width: 32, height: 32, background: 'var(--color-primary-600, #B71C1C)', fontSize: 12 }}
          >
            {userName?.charAt(0) ?? '?'}
          </div>
          <div className="overflow-hidden sidebar-brand-full">
            <div className="text-truncate small text-white">{userName}</div>
            <div className="text-truncate text-white-50" style={{ fontSize: 11, textTransform: 'capitalize' }}>
              {user?.role}
            </div>
          </div>
        </div>
        <div className="d-flex align-items-center">
          <button
            type="button"
            onClick={logout}
            className="btn btn-sm btn-link text-white-50 p-1 sidebar-brand-full"
            title={t('تسجيل الخروج', 'Logout')}
            aria-label={t('تسجيل الخروج', 'Logout')}
          >
            <LogOut style={{ width: 16, height: 16 }} />
          </button>
          <CSidebarToggler
            className="d-none d-lg-flex"
            onClick={onUnfoldableToggle}
          />
        </div>
      </CSidebarFooter>
    </CSidebar>
  );
}
