'use client';

import Link from 'next/link';
import { Package, Store, FileText, Bell, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { useProcurementOverview, useAlerts } from '@/hooks/useProcurement';
import { useLang } from '@/contexts/LanguageContext';

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
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="animate-slide-down">
        <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t('المشتريات الطبية', 'Medical Procurement')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {t('إدارة المخزون والموردين وسجلات الاستلام', 'Inventory, supplier directory & receipt logging')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('عناصر الكتالوج', 'Catalog Items')}
          value={isLoading ? '…' : (overview?.totalItems ?? 0)}
          icon={<Package className="w-5 h-5" />}
          color="blue"
          description={t('مادة طبية مسجلة', 'registered items')}
        />
        <StatCard
          title={t('عناصر منخفضة', 'Low Stock')}
          value={isLoading ? '…' : (overview?.lowStockItems ?? 0)}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="rose"
          description={t('تحتاج إعادة طلب', 'need reordering')}
        />
        <StatCard
          title={t('إيصالات الاستلام', 'Total Receipts')}
          value={isLoading ? '…' : (overview?.totalReceipts ?? 0)}
          icon={<FileText className="w-5 h-5" />}
          color="violet"
          description={t('إيصال مسجل', 'logged receipts')}
        />
        <StatCard
          title={t('الموردون المعتمدون', 'Approved Vendors')}
          value={isLoading ? '…' : (overview?.totalVendors ?? 0)}
          icon={<Store className="w-5 h-5" />}
          color="emerald"
          description={t('مورد معتمد', 'approved vendors')}
        />
      </div>

      {/* Pending / discrepancy secondary stats */}
      {!isLoading && overview && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <FileText className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">{overview.pendingReceipts}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('إيصالات معلقة', 'Pending receipts')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <div>
                <p className="text-lg font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">{overview.discrepancyReceipts}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('إيصالات بتناقض', 'Discrepancy receipts')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Low-stock alert banner */}
      {!isLoading && overview && overview.lowStockItems > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
            {t(
              `${overview.lowStockItems} عنصر بمخزون منخفض يحتاج إعادة طلب`,
              `${overview.lowStockItems} item${overview.lowStockItems !== 1 ? 's' : ''} are low on stock and need reordering`
            )}
          </p>
          <Link href="/procurement/alerts" className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap">
            {t('عرض التنبيهات', 'View alerts')}
          </Link>
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
