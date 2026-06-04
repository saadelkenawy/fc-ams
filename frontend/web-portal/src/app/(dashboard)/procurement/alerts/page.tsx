'use client';

import { useState } from 'react';
import { Bell, CheckCircle, AlertTriangle, Clock, RefreshCw, BellOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAlerts, useMarkAlertRead, useMarkAllAlertsRead, type ProcurementAlert } from '@/hooks/useProcurement';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { procurementApi } from '@/lib/api';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

const SEVERITY_BADGE: Record<string, BadgeVariant> = {
  critical: 'danger',
  warning:  'warning',
  info:     'info',
};

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  EXPIRY_ALERT:      { ar: 'انتهاء صلاحية',    en: 'Expiry Alert' },
  REORDER_ALERT:     { ar: 'إعادة طلب مخزون',  en: 'Reorder Alert' },
  DISCREPANCY_ALERT: { ar: 'اختلاف في الكمية', en: 'Discrepancy' },
};

const SEVERITY_LABELS: Record<string, { ar: string; en: string }> = {
  critical: { ar: 'حرج',       en: 'Critical' },
  warning:  { ar: 'تحذير',     en: 'Warning' },
  info:     { ar: 'معلومات',   en: 'Info' },
};

type FilterType = 'all' | 'unread' | 'EXPIRY_ALERT' | 'REORDER_ALERT' | 'DISCREPANCY_ALERT';

export default function AlertsPage() {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>('unread');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [scanning, setScanning] = useState<'expiry' | 'reorder' | null>(null);

  const params = {
    page,
    limit,
    ...(filter === 'unread'  ? { isRead: false } : {}),
    ...(filter !== 'all' && filter !== 'unread' ? { alertType: filter } : {}),
  };

  const { data, isLoading, refetch } = useAlerts(params);
  const markRead    = useMarkAlertRead();
  const markAllRead = useMarkAllAlertsRead();

  const alerts = data?.data ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;

  const FILTER_TABS: { key: FilterType; labelAr: string; labelEn: string }[] = [
    { key: 'unread',           labelAr: 'غير مقروءة',         labelEn: 'Unread' },
    { key: 'all',              labelAr: 'الكل',               labelEn: 'All' },
    { key: 'EXPIRY_ALERT',     labelAr: 'انتهاء الصلاحية',   labelEn: 'Expiry' },
    { key: 'REORDER_ALERT',    labelAr: 'إعادة الطلب',        labelEn: 'Reorder' },
    { key: 'DISCREPANCY_ALERT',labelAr: 'التناقضات',          labelEn: 'Discrepancy' },
  ];

  async function handleMarkRead(id: string) {
    try {
      await markRead.mutateAsync(id);
    } catch {
      toast(t('حدث خطأ', 'Something went wrong'), 'error');
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead.mutateAsync();
      toast(t('تم تحديد الكل كمقروء', 'All alerts marked as read'), 'success');
    } catch {
      toast(t('حدث خطأ', 'Something went wrong'), 'error');
    }
  }

  async function runScan(type: 'expiry' | 'reorder') {
    setScanning(type);
    try {
      await procurementApi.post(`/alerts/check-${type}`, {});
      toast(t('اكتمل الفحص', `${type === 'expiry' ? 'Expiry' : 'Reorder'} scan complete`), 'success');
      refetch();
    } catch {
      toast(t('فشل الفحص', 'Scan failed'), 'error');
    } finally {
      setScanning(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('تنبيهات المشتريات', 'Procurement Alerts')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('انتهاء الصلاحية، إعادة الطلب، والتناقضات', 'Expiry, reorder & discrepancy alerts')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => runScan('expiry')}
            disabled={scanning !== null}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning === 'expiry' ? 'animate-spin' : ''}`} />
            {t('فحص الصلاحية', 'Scan Expiry')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => runScan('reorder')}
            disabled={scanning !== null}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning === 'reorder' ? 'animate-spin' : ''}`} />
            {t('فحص المخزون', 'Scan Reorder')}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => handleMarkAllRead()}
              disabled={markAllRead.isLoading}
            >
              <BellOff className="w-3.5 h-3.5" />
              {t('تحديد الكل كمقروء', 'Mark All Read')}
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${
              filter === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-600'
            }`}
          >
            {t(tab.labelAr, tab.labelEn)}
            {tab.key === 'unread' && unreadCount > 0 && (
              <span className="ms-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('التنبيهات', 'Alerts')}</CardTitle>
          {!isLoading && <span className="text-xs text-gray-400">{total} {t('تنبيه', 'alerts')}</span>}
        </CardHeader>
        <CardContent className="p-0 mt-4">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-16" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="py-16 text-center">
              <BellOff className="w-10 h-10 text-gray-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">{t('لا توجد تنبيهات', 'No alerts found')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-neutral-700/50">
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  lang={lang}
                  onMarkRead={() => handleMarkRead(alert.id)}
                  isMarking={markRead.isLoading}
                  t={t}
                />
              ))}
            </div>
          )}
          {!isLoading && total > limit && (
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={() => {}} pageSizes={[25]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertRow({
  alert, lang, onMarkRead, isMarking, t,
}: {
  alert: ProcurementAlert;
  lang: string;
  onMarkRead: () => void;
  isMarking: boolean;
  t: (ar: string, en: string) => string;
}) {
  const typeLabel = TYPE_LABELS[alert.alertType] ?? { ar: alert.alertType, en: alert.alertType };
  const sevLabel  = SEVERITY_LABELS[alert.severity] ?? { ar: alert.severity, en: alert.severity };

  const SeverityIcon =
    alert.severity === 'critical' ? AlertTriangle :
    alert.severity === 'warning'  ? Clock :
    Bell;

  return (
    <div className={`flex items-start gap-4 px-5 py-4 transition-colors ${
      !alert.isRead ? 'bg-amber-50/30 dark:bg-amber-900/5' : 'hover:bg-gray-50/50 dark:hover:bg-neutral-700/20'
    }`}>
      {/* Severity icon */}
      <div className={`mt-0.5 flex-shrink-0 ${
        alert.severity === 'critical' ? 'text-red-500' :
        alert.severity === 'warning'  ? 'text-amber-500' :
        'text-blue-400'
      }`}>
        <SeverityIcon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant={SEVERITY_BADGE[alert.severity] ?? 'warning'} className="text-xs">
            {t(sevLabel.ar, sevLabel.en)}
          </Badge>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {t(typeLabel.ar, typeLabel.en)}
          </span>
          {!alert.isRead && (
            <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-gray-800 dark:text-gray-200">{alert.message}</p>
        <p className="text-xs text-gray-400 mt-1">
          {new Date(alert.triggeredAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
          {alert.resolvedAt && (
            <span className="ms-2 text-emerald-500">
              · {t('تم الحل', 'Resolved')} {new Date(alert.resolvedAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
            </span>
          )}
        </p>
      </div>

      {/* Mark read */}
      <div className="flex-shrink-0">
        {alert.isRead ? (
          <CheckCircle className="w-4 h-4 text-emerald-500" />
        ) : (
          <button
            onClick={onMarkRead}
            disabled={isMarking}
            className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            title={t('تحديد كمقروء', 'Mark as read')}
          >
            <CheckCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
