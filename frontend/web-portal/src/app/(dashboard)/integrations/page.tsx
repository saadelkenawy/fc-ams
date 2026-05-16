'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plug, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { integrationApi } from '@/lib/api';

interface WebhookEvent {
  id:             string;
  platform:       string;
  eventType:      string;
  status:         'pending' | 'processed' | 'failed' | 'duplicate';
  idempotencyKey: string;
  errorMessage?:  string;
  createdAt:      string;
  processedAt?:   string;
}

const PLATFORM_LABELS: Record<string, string> = {
  vizita:   'Vizita',
  ekshf:    'Ekshf',
  clinido:  'CliniDo',
  instapay: 'InstaPay',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  processed: 'success',
  failed:    'danger',
  pending:   'warning',
  duplicate: 'default',
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  processed: CheckCircle2,
  failed:    AlertCircle,
  pending:   Clock,
  duplicate: RefreshCw,
};

function useWebhookEvents(platform?: string) {
  return useQuery({
    queryKey: ['webhook-events', platform],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50' };
      if (platform) params.platform = platform;
      const { data } = await integrationApi.get<{ success: boolean; data: WebhookEvent[] }>(
        '/events',
        { params },
      );
      return data.data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export default function IntegrationsPage() {
  const { lang, t } = useLang();
  const [platform, setPlatform] = useState('');

  const { data: events, isLoading, isError, refetch, isFetching } = useWebhookEvents(platform || undefined);

  function relTime(iso: string) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return t('الآن', 'Just now');
    if (mins < 60) return lang === 'ar' ? `${mins} د` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return lang === 'ar' ? `${hrs} س` : `${hrs}h ago`;
    return lang === 'ar' ? `${Math.floor(hrs / 24)} ي` : `${Math.floor(hrs / 24)}d ago`;
  }

  const platforms = ['vizita', 'ekshf', 'clinido', 'instapay'];

  return (
    <div className="space-y-5 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t('تكاملات خارجية', 'External Integrations')}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {t('تحديث', 'Refresh')}
        </Button>
      </div>

      {/* Platform summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {platforms.map((p) => {
          const count = events?.filter((e) => e.platform === p).length ?? 0;
          const failed = events?.filter((e) => e.platform === p && e.status === 'failed').length ?? 0;
          return (
            <button
              key={p}
              onClick={() => setPlatform(platform === p ? '' : p)}
              className={`p-4 rounded-xl border text-start transition-all ${
                platform === p
                  ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-primary-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Plug className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{PLATFORM_LABELS[p]}</span>
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{count}</p>
              <p className="text-xs text-gray-400">{t('حدث', 'events')}</p>
              {failed > 0 && (
                <p className="text-xs text-red-500 mt-1">{failed} {t('فشل', 'failed')}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Events table */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Plug className="w-4 h-4" />
            {platform ? `${PLATFORM_LABELS[platform]} ${t('أحداث', 'Events')}` : t('جميع الأحداث', 'All Events')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="py-12 text-center text-gray-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              {t('جاري التحميل...', 'Loading...')}
            </div>
          )}
          {isError && (
            <div className="py-12 text-center text-red-500 text-sm">
              {t('تعذّر تحميل الأحداث', 'Failed to load events')}
            </div>
          )}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    {['Platform', 'Event', 'Status', 'Error', 'Time'].map((h) => (
                      <th key={h} className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!events || events.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                        {t('لا توجد أحداث', 'No events found')}
                      </td>
                    </tr>
                  )}
                  {(events ?? []).map((ev) => {
                    const Icon = STATUS_ICON[ev.status] ?? Clock;
                    return (
                      <tr key={ev.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{PLATFORM_LABELS[ev.platform] ?? ev.platform}</span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-mono text-xs">{ev.eventType}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={STATUS_VARIANT[ev.status] ?? 'default'} className="flex items-center gap-1 w-fit">
                            <Icon className="w-3 h-3" />
                            {ev.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-red-500 max-w-[200px] truncate" title={ev.errorMessage}>
                          {ev.errorMessage ?? '—'}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                          {relTime(ev.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
