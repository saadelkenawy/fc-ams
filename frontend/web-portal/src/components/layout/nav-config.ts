import type { UserRole } from '@fadl/types';

export interface NavItem {
  key: string;
  href: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  badge?: string;
}

export interface NavGroup {
  groupAr?: string;
  groupEn?: string;
  items: NavItem[];
}

const NAV: Record<UserRole, NavGroup[]> = {
  admin: [
    {
      items: [
        { key: 'dashboard',    href: '/',             labelAr: 'الرئيسية',        labelEn: 'Dashboard',    icon: 'LayoutDashboard' },
        { key: 'patients',     href: '/patients',     labelAr: 'المرضى',          labelEn: 'Patients',     icon: 'Users' },
        { key: 'appointments', href: '/appointments', labelAr: 'المواعيد',        labelEn: 'Appointments', icon: 'CalendarDays' },
        { key: 'doctors',      href: '/doctors',      labelAr: 'الأطباء',         labelEn: 'Doctors',      icon: 'Stethoscope' },
      ],
    },
    {
      groupAr: 'المالية',
      groupEn: 'Finance',
      items: [
        { key: 'billing',      href: '/billing',      labelAr: 'الفواتير',        labelEn: 'Billing',      icon: 'Receipt' },
        { key: 'settlements',  href: '/billing/settlements', labelAr: 'التسويات', labelEn: 'Settlements',  icon: 'Banknote' },
      ],
    },
    {
      groupAr: 'التحليلات',
      groupEn: 'Analytics',
      items: [
        { key: 'analytics',    href: '/analytics',    labelAr: 'الإحصائيات',      labelEn: 'Analytics',    icon: 'BarChart3' },
        { key: 'reports',      href: '/reports',          labelAr: 'التقارير',   labelEn: 'Reports',      icon: 'FileText' },
      ],
    },
    {
      groupAr: 'الإعدادات',
      groupEn: 'System',
      items: [
        { key: 'procedures',   href: '/procedures',   labelAr: 'الإجراءات',       labelEn: 'Procedures',   icon: 'Clipboard' },
        { key: 'sources',      href: '/sources',      labelAr: 'مصادر المرضى',    labelEn: 'Sources',      icon: 'Share2' },
        { key: 'encounters',   href: '/encounters',   labelAr: 'الحالات السريرية', labelEn: 'Encounters',   icon: 'FileHeart' },
        { key: 'chatbot',       href: '/chatbot',       labelAr: 'المساعد الذكي',    labelEn: 'AI Assistant',  icon: 'Bot' },
        { key: 'integrations', href: '/integrations', labelAr: 'التكاملات الخارجية', labelEn: 'Integrations', icon: 'Plug' },
        { key: 'settings',     href: '/settings',     labelAr: 'الإعدادات',        labelEn: 'Settings',      icon: 'Settings' },
      ],
    },
  ],

  receptionist: [
    {
      items: [
        { key: 'quick-entry',  href: '/receptionist', labelAr: 'الإدخال السريع',  labelEn: 'Quick Entry',  icon: 'Zap' },
        { key: 'queue',        href: '/receptionist/queue', labelAr: 'قائمة الانتظار', labelEn: 'Queue Board', icon: 'List' },
        { key: 'appointments', href: '/appointments', labelAr: 'المواعيد',        labelEn: 'Appointments', icon: 'CalendarDays' },
        { key: 'patients',     href: '/patients',     labelAr: 'المرضى',          labelEn: 'Patients',     icon: 'Users' },
        { key: 'payments',     href: '/billing/payments', labelAr: 'المدفوعات',   labelEn: 'Payments',     icon: 'CreditCard' },
      ],
    },
  ],

  doctor: [
    {
      items: [
        { key: 'schedule',     href: '/doctor/schedule',  labelAr: 'جدولي',        labelEn: 'My Schedule',  icon: 'CalendarDays' },
        { key: 'patients',     href: '/doctor/patients',  labelAr: 'مرضاي',        labelEn: 'My Patients',  icon: 'Users' },
        { key: 'earnings',     href: '/doctor/earnings',  labelAr: 'أرباحي',       labelEn: 'My Earnings',  icon: 'TrendingUp' },
        { key: 'notes',        href: '/doctor/notes',     labelAr: 'الملاحظات',    labelEn: 'Clinical Notes', icon: 'FileText' },
        { key: 'encounters',   href: '/encounters',       labelAr: 'الحالات السريرية', labelEn: 'Encounters', icon: 'FileHeart' },
      ],
    },
  ],

  finance: [
    {
      items: [
        { key: 'dashboard',    href: '/',             labelAr: 'الرئيسية',        labelEn: 'Dashboard',    icon: 'LayoutDashboard' },
        { key: 'transactions', href: '/billing',      labelAr: 'المعاملات',       labelEn: 'Transactions', icon: 'Receipt' },
        { key: 'settlements',  href: '/billing/settlements', labelAr: 'التسويات', labelEn: 'Settlements',  icon: 'Banknote' },
        { key: 'sources',      href: '/sources',      labelAr: 'مصادر المرضى',    labelEn: 'Sources',      icon: 'Share2' },
        { key: 'reports',      href: '/reports',      labelAr: 'التقارير',        labelEn: 'Reports',      icon: 'FileText' },
      ],
    },
  ],

  patient: [
    {
      items: [
        { key: 'home',         href: '/',             labelAr: 'الرئيسية',        labelEn: 'Home',         icon: 'Home' },
        { key: 'appointments', href: '/appointments', labelAr: 'مواعيدي',        labelEn: 'My Appointments', icon: 'CalendarDays' },
        { key: 'records',      href: '/records',      labelAr: 'سجلاتي',         labelEn: 'My Records',   icon: 'FileText' },
      ],
    },
  ],
};

export function getNavForRole(role: UserRole): NavGroup[] {
  return NAV[role] ?? NAV.receptionist;
}
