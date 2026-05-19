'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus, Users, TrendingUp, Globe, Search, X, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { useLang } from '@/contexts/LanguageContext';
import { formatDate } from '@/lib/utils';
import { usePatients, useDeletePatient } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { AddPatientModal } from '@/components/patients/AddPatientModal';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { useToast } from '@/components/ui/Toast';
import type { Patient } from '@fadl/types';

/* ── Source colours matching design kit ───────────────────────────────────── */
const SOURCE_TAG: Record<string, { bg: string; fg: string; dot: string }> = {
  'VEZ':      { bg: '#DBEAFE', fg: '#1E40AF', dot: '#3B82F6' },
  "Cl.'s":    { bg: '#EDE9FE', fg: '#5B21B6', dot: '#8B5CF6' },
  'Direct':   { bg: '#D1FAE5', fg: '#047857', dot: '#10B981' },
  'Referral': { bg: '#FFE4D6', fg: '#B45309', dot: '#F0623E' },
};

const SOURCE_FILTERS = ['all', 'VEZ', "Cl.'s", 'Direct', 'Referral'] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#B71C1C,#7F1D1D)',
  'linear-gradient(135deg,#1D4ED8,#1E40AF)',
  'linear-gradient(135deg,#047857,#065F46)',
  'linear-gradient(135deg,#6D28D9,#5B21B6)',
  'linear-gradient(135deg,#B45309,#92400E)',
  'linear-gradient(135deg,#0369A1,#075985)',
];

/* ── Sub-components ───────────────────────────────────────────────────────── */
function PatientAvatar({ name, index }: { name: string; index: number }) {
  return (
    <div
      className="fc-pt-avatar"
      style={{ background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length] }}
      aria-label={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 140; const H = 26;
  if (data.length < 2) return null;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(' ');
  const last = data[data.length - 1];
  const lx = W;
  const ly = H - ((last - min) / range) * H;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 'auto', overflow: 'visible', display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={color} />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="fc-pt-row" style={{ pointerEvents: 'none' }}>
      <div className="fc-pt-cell-name">
        <div className="fc-pt-avatar" style={{ background: '#F3F4F6' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 12, width: 110, background: '#F3F4F6', borderRadius: 9999 }} />
          <div style={{ height: 10, width: 70, background: '#F3F4F6', borderRadius: 9999 }} />
        </div>
      </div>
      {[90, 80, 70, 80, 60].map((w, i) => (
        <div key={i} style={{ height: 11, width: `${w}%`, background: '#F3F4F6', borderRadius: 9999 }} />
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function PatientsPage() {
  const { lang, t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [query, setQuery]             = useState(() => searchParams.get('query') ?? '');
  const [page, setPage]               = useState(1);
  const [limit, setLimit]             = useState(10);
  const [source, setSource]           = useState<SourceFilter>('all');
  const [futureOnly, setFutureOnly]   = useState(false);
  const [addOpen, setAddOpen]         = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);

  useEffect(() => {
    const urlQuery = searchParams.get('query');
    if (urlQuery) setQuery(urlQuery);
  }, [searchParams]);

  const debouncedQuery = useDebounce(query, 300);
  const deletePatient  = useDeletePatient();

  const { data, isLoading } = usePatients({
    query: debouncedQuery || undefined,
    page,
    limit,
    isFutureSource: futureOnly || undefined,
  });

  const allPatients = data?.data ?? [];
  const total       = data?.total ?? 0;

  const patients = source === 'all'
    ? allPatients
    : allPatients.filter((p) => p.sourceFirstVisit === source);

  const newCount = allPatients.filter((p) => {
    if (!p.createdAt) return false;
    const d = new Date(p.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const channelCounts = allPatients.reduce<Record<string, number>>((acc, p) => {
    const src = p.sourceFirstVisit ?? 'Other';
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});
  const channelTotal = allPatients.length || 1;
  const topChannel   = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0];

  function handleDelete() {
    if (!deleteTarget) return;
    deletePatient.mutate(deleteTarget.patientId, {
      onSuccess: () => { toast(t('تم حذف المريض', 'Patient deleted'), 'success'); setDeleteTarget(null); },
      onError:   () => toast(t('تعذّر حذف المريض', "Couldn't delete patient"), 'error'),
    });
  }

  return (
    <div className="fc-page animate-fade-in">

      {/* ── Page header ── */}
      <div className="fc-page-head animate-slide-down">
        <div>
          <h2 className="fc-page-title">{t('المرضى', 'Patients')}</h2>
          <p className="fc-page-sub">
            {total} {t('مريض مسجل', 'registered')}
            {' · '}
            {newCount} {t('جديد هذا الشهر', 'new this month')}
          </p>
        </div>
        <div className="fc-page-actions">
          <button
            className="fc-btn fc-btn-outline fc-btn-sm"
            onClick={() => { setFutureOnly((v) => !v); setPage(1); }}
            style={futureOnly ? { background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' } : undefined}
          >
            <span style={{ fontSize: 11, lineHeight: 1 }}>◈</span>
            {t('المستقبلية', 'Future Sources')}
          </button>
          <button className="fc-btn fc-btn-primary fc-btn-sm" onClick={() => setAddOpen(true)}>
            <UserPlus size={14} />
            {t('مريض جديد', 'New Patient')}
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="fc-pt-kpi-row animate-slide-up">

        {/* Total patients */}
        <div className="fc-pt-kpi">
          <div className="fc-pt-kpi-head">
            <div className="fc-pt-kpi-icon" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
              <Users size={18} />
            </div>
            <span className="fc-pt-kpi-tag" style={{ background: '#D1FAE5', color: '#047857' }}>
              <TrendingUp size={10} strokeWidth={2.4} />
              +0.7%
            </span>
          </div>
          <div className="fc-pt-kpi-value">{isLoading ? '…' : total}</div>
          <div className="fc-pt-kpi-label">{t('إجمالي المرضى', 'Total patients')}</div>
          <Sparkline data={[42, 45, 47, 51, 53, 56, total || 58]} color="#3B82F6" />
        </div>

        {/* New this month */}
        <div className="fc-pt-kpi">
          <div className="fc-pt-kpi-head">
            <div className="fc-pt-kpi-icon" style={{ background: '#D1FAE5', color: '#047857' }}>
              <TrendingUp size={18} />
            </div>
            <span className="fc-pt-kpi-tag" style={{ background: '#D1FAE5', color: '#047857' }}>
              <TrendingUp size={10} strokeWidth={2.4} />
              +33%
            </span>
          </div>
          <div className="fc-pt-kpi-value">{isLoading ? '…' : newCount}</div>
          <div className="fc-pt-kpi-label">{t('جديد هذا الشهر', 'New this month')}</div>
          <Sparkline data={[3, 6, 4, 7, 5, 8, newCount || 8]} color="#10B981" />
        </div>

        {/* Acquisition channels */}
        <div className="fc-pt-kpi">
          <div className="fc-pt-kpi-head">
            <div className="fc-pt-kpi-icon" style={{ background: '#EDE9FE', color: '#5B21B6' }}>
              <Globe size={18} />
            </div>
            <span className="fc-pt-kpi-tag" style={{ background: 'rgba(148,163,184,0.18)', color: '#475569' }}>
              top source
            </span>
          </div>
          <div className="fc-pt-kpi-value">
            {topChannel?.[0] ?? 'VEZ'}
            {' '}
            <span className="fc-pt-kpi-num">·{topChannel?.[1] ?? 0}</span>
          </div>
          <div className="fc-pt-kpi-label">{t('قنوات الاستقطاب', 'Acquisition channels')}</div>
          <div className="fc-pt-channel-bar">
            {Object.entries(channelCounts).map(([src, cnt]) => {
              const tag = SOURCE_TAG[src];
              return (
                <span
                  key={src}
                  style={{ width: `${(cnt / channelTotal) * 100}%`, background: tag?.dot ?? '#94A3B8' }}
                  title={`${src}: ${cnt}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="fc-pt-toolbar animate-slide-up" style={{ animationDelay: '40ms' }}>
        <div className="fc-dr-search">
          <Search size={15} className="fc-dr-search-icon" />
          <input
            placeholder={t('بحث بالاسم، الموبايل، أو الرقم القومي…', 'Search by name, mobile, or national ID…')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
          {query && (
            <button className="fc-dr-search-clear" onClick={() => { setQuery(''); setPage(1); }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div className="fc-pt-source-filters">
          {SOURCE_FILTERS.map((s) => {
            const tag  = s !== 'all' ? SOURCE_TAG[s] : null;
            const isOn = source === s;
            return (
              <button
                key={s}
                className={`fc-pt-source-chip${isOn ? ' is-on' : ''}`}
                onClick={() => { setSource(s); setPage(1); }}
                style={tag && isOn ? { background: tag.bg, color: tag.fg } : undefined}
              >
                {tag && <span className="fc-pt-source-dot" style={{ background: tag.dot }} />}
                {s === 'all' ? t('الكل', 'All') : s}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Patient list ── */}
      <div className="fc-card animate-slide-up" style={{ animationDelay: '80ms' }}>
        <div className="fc-pt-list-head">
          <span>{t('المريض', 'Patient')}</span>
          <span>{t('الموبايل', 'Contact')}</span>
          <span>{t('تاريخ الميلاد', 'Date of birth')}</span>
          <span>{t('تاريخ التسجيل', 'Joined')}</span>
          <span>{t('المصدر', 'Source')}</span>
          <span />
        </div>

        <div className="fc-pt-list">
          {isLoading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

          {!isLoading && patients.map((p, idx) => {
            const name  = lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn;
            const isNew = p.createdAt && (() => {
              const d   = new Date(p.createdAt!);
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            })();
            const src = p.sourceFirstVisit ? (SOURCE_TAG[p.sourceFirstVisit] ?? null) : null;

            return (
              <div
                key={p.patientId}
                className="fc-pt-row"
                onClick={() => router.push(`/patients/${p.patientId}`)}
              >
                {/* Name + avatar */}
                <div className="fc-pt-cell-name">
                  <PatientAvatar name={name} index={idx} />
                  <div>
                    <div className={`fc-pt-name${lang === 'ar' ? ' is-rtl' : ''}`}>
                      {name}
                      {isNew && (
                        <span className="fc-pt-status" style={{ background: 'rgba(59,130,246,0.12)', color: '#1E40AF' }}>
                          {t('جديد', 'New')}
                        </span>
                      )}
                      {p.isFutureSource && (
                        <span className="fc-pt-status" style={{ background: 'rgba(139,92,246,0.12)', color: '#5B21B6' }}>◈</span>
                      )}
                    </div>
                    <div className="fc-pt-visits">{p.nationalId ?? '—'}</div>
                  </div>
                </div>

                {/* Mobile */}
                <div className="fc-pt-cell-faded" style={{ fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'start' }}>
                  {p.mobile}
                </div>

                {/* DOB */}
                <div className="fc-pt-cell-faded">
                  {p.dateOfBirth ? formatDate(p.dateOfBirth, lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                </div>

                {/* Joined */}
                <div className="fc-pt-cell-faded">
                  {p.createdAt ? formatDate(p.createdAt, lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                </div>

                {/* Source tag */}
                <div>
                  {src ? (
                    <span className="fc-pt-src-tag" style={{ background: src.bg, color: src.fg }}>
                      <span className="fc-pt-src-dot" style={{ background: src.dot }} />
                      {p.sourceFirstVisit}
                    </span>
                  ) : p.sourceFirstVisit ? (
                    <span className="fc-pt-src-tag" style={{ background: '#F3F4F6', color: '#374151' }}>
                      {p.sourceFirstVisit}
                    </span>
                  ) : (
                    <span className="fc-pt-cell-faded">—</span>
                  )}
                </div>

                {/* Actions */}
                <div className="fc-pt-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="fc-pt-act fc-pt-act-primary"
                    onClick={() => router.push(`/patients/${p.patientId}`)}
                    title={t('فتح الملف', 'Open chart')}
                  >
                    {t('فتح', 'Open')} <ChevronRight size={11} strokeWidth={2.4} />
                  </button>
                  <button
                    className="fc-pt-act"
                    onClick={() => setEditPatient(p)}
                    title={t('تعديل', 'Edit')}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="fc-pt-act fc-pt-act-warn"
                    onClick={() => setDeleteTarget(p)}
                    title={t('حذف', 'Delete')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}

          {!isLoading && patients.length === 0 && (
            <div className="fc-empty">
              <Search size={32} strokeWidth={1.5} />
              <h3>{t('لا يوجد مرضى', 'No patients match')}</h3>
              <p>{t('جرّب بحثاً مختلفاً أو امسح الفلتر', 'Try a different search or clear the filter.')}</p>
            </div>
          )}
        </div>

        <div className="fc-pt-pagination">
          <Pagination
            page={page}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
            pageSizes={[10, 25, 50]}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      <AddPatientModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => router.push(`/patients/${id}`)}
      />

      {editPatient && (
        <EditPatientModal
          open={!!editPatient}
          onClose={() => setEditPatient(null)}
          patient={editPatient}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletePatient.isLoading}
        title={t('حذف المريض', 'Delete Patient')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف ${deleteTarget.nameAr ?? deleteTarget.nameEn}؟ لا يمكن التراجع.`,
                `Delete ${deleteTarget.nameEn}? This removes their record permanently.`,
              )
            : ''
        }
        confirmLabel={t('حذف', 'Delete')}
      />
    </div>
  );
}
