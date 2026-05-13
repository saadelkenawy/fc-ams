'use client';

import Link from 'next/link';
import { Package, Store, FileText, Bell, AlertTriangle, TrendingDown, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useProcurementOverview, useAlerts } from '@/hooks/useProcurement';
import { useLang } from '@/contexts/LanguageContext';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
}

function StatCard({ label, value, icon: Icon, href, accent = 'blue' }: StatCardProps) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    amber:  'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  };
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-5 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[accent]}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

const ALERT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  EXPIRY_ALERT:      { ar: 'انتهاء صلاحية',   en: 'Expiry' },
  REORDER_ALERT:     { ar: 'إعادة طلب',        en: 'Reorder' },
  DISCREPANCY_ALERT: { ar: 'اختلاف في الكمية', en: 'Discrepancy' },
};

const SEVERITY_BADGE: Record<string, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  warning:  'warning',
  info:     'info',
};

export default function ProcurementPage() {
  const { lang, t } = useLang();
  const { data: overview, isLoading } = useProcurementOverview();
  const { data: alertsData } = useAlerts({ isRead: false, limit: 5 });
  const recentAlerts = alertsData?.data ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t('المشتريات الطبية', 'Medical Procurement')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {t('إدارة المخزون والموردين وسجلات الاستلام', 'Inventory, supplier directory & receipt logging')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-16" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard label={t('عناصر الكتالوج', 'Catalog Items')}  value={overview?.totalItems ?? 0}    icon={Package}   href="/procurement/catalog"  accent="blue" />
            <StatCard label={t('الموردون المعتمدون', 'Approved Vendors')} value={overview?.totalVendors ?? 0} icon={Store}     href="/procurement/vendors"  accent="green" />
            <StatCard label={t('إيصالات الاستلام', 'Total Receipts')}  value={overview?.totalReceipts ?? 0} icon={FileText}  href="/procurement/receipts" accent="purple" />
            <StatCard label={t('تنبيهات غير مقروءة', 'Unread Alerts')}  value={overview?.unreadAlerts ?? 0}  icon={Bell}      href="/procurement/alerts"   accent={overview?.unreadAlerts ? 'red' : 'blue'} />
          </>
        )}
      </div>

      {/* Secondary stats row */}
      {!isLoading && overview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{overview.pendingReceipts}</p>
                <p className="text-xs text-gray-500">{t('إيصالات معلقة', 'Pending receipts')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{overview.discrepancyReceipts}</p>
                <p className="text-xs text-gray-500">{t('إيصالات بتناقض', 'Discrepancy receipts')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingDown className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{overview.lowStockItems}</p>
                <p className="text-xs text-gray-500">{t('عناصر منخفضة المخزون', 'Low stock items')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/procurement/catalog',  icon: Package,  labelAr: 'كتالوج العناصر',  labelEn: 'Item Catalog',  descAr: 'عرض وإدارة المواد الطبية', descEn: 'Browse & manage supplies' },
          { href: '/procurement/vendors',  icon: Store,    labelAr: 'الموردون',         labelEn: 'Vendors',        descAr: 'دليل الموردين المصريين',    descEn: 'Egyptian supplier directory' },
          { href: '/procurement/receipts', icon: FileText, labelAr: 'الإيصالات',        labelEn: 'Receipts',       descAr: 'تسجيل الفواتير والاستلام',  descEn: 'Log invoices & deliveries' },
          { href: '/procurement/alerts',   icon: Bell,     labelAr: 'التنبيهات',        labelEn: 'Alerts',         descAr: 'انتهاء الصلاحية وإعادة الطلب', descEn: 'Expiry & reorder alerts' },
        ].map(({ href, icon: Icon, labelAr, labelEn, descAr, descEn }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4">
                <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400 mb-2" />
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t(labelAr, labelEn)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t(descAr, descEn)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent unread alerts */}
      {recentAlerts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t('آخر التنبيهات', 'Recent Alerts')}</CardTitle>
            <Link href="/procurement/alerts" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
              {t('عرض الكل', 'View all')}
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {recentAlerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
                    <td className="px-5 py-3">
                      <Badge variant={SEVERITY_BADGE[alert.severity] ?? 'warning'}>
                        {t(ALERT_TYPE_LABELS[alert.alertType]?.ar ?? alert.alertType, ALERT_TYPE_LABELS[alert.alertType]?.en ?? alert.alertType)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{alert.message}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(alert.triggeredAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                    </td>
                    <td className="px-5 py-3">
                      {alert.isRead
                        ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                        : <Bell className="w-4 h-4 text-amber-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
