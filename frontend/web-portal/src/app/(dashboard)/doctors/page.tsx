'use client';

import { useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useRouter } from 'next/navigation';
import {
  Search, X, Stethoscope, Users, PowerOff, Wifi,
  Calendar, Pencil, Trash2, Power, ChevronRight,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctors, useSpecialtyMap, useToggleDoctorActive, useDeleteDoctor } from '@/hooks/useDoctors';
import { AddDoctorModal } from '@/components/doctors/AddDoctorModal';
import { EditDoctorModal } from '@/components/doctors/EditDoctorModal';
import { useToast } from '@/components/ui/Toast';
import type { Doctor } from '@fadl/types';

/* ── Status config (maps isActive / isOnlineDoctor) ─────────────────────── */
const STATUS_MAP = {
  online:   { dot: '#10B981', bg: 'rgba(16,185,129,0.15)',  fg: '#10B981', label: { en: 'Online',  ar: 'أونلاين' } },
  active:   { dot: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  fg: '#3B82F6', label: { en: 'Active',  ar: 'نشط'    } },
  inactive: { dot: '#94A3B8', bg: 'rgba(148,163,184,0.15)', fg: '#94A3B8', label: { en: 'On hold', ar: 'غير نشط' } },
} as const;

type StatusKey = keyof typeof STATUS_MAP;

function doctorStatus(d: Doctor): StatusKey {
  if (!d.isActive) return 'inactive';
  if (d.isOnlineDoctor) return 'online';
  return 'active';
}

/* ── Avatar colours ──────────────────────────────────────────────────────── */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#B71C1C,#7F1D1D)',
  'linear-gradient(135deg,#1D4ED8,#1E40AF)',
  'linear-gradient(135deg,#047857,#065F46)',
  'linear-gradient(135deg,#6D28D9,#5B21B6)',
  'linear-gradient(135deg,#B45309,#92400E)',
  'linear-gradient(135deg,#0369A1,#075985)',
];

/* ── Small sparkline for KPI tiles (64×24) ───────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 64; const H = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ');
  const last = data[data.length - 1];
  const lx = W; const ly = H - ((last - min) / range) * H;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', flexShrink: 0, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
type FilterKey = 'all' | 'online' | 'active' | 'inactive';

export default function DoctorsPage() {
  const { lang, t } = useLang();
  const router      = useRouter();
  const { toast }   = useToast();

  const [query, setQuery]             = useState('');
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [addOpen, setAddOpen]         = useState(false);
  const [editDoctor, setEditDoctor]   = useState<Doctor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);

  const { data, isLoading } = useDoctors({ limit: 500 });
  const specialtyMap        = useSpecialtyMap();
  const toggleActive        = useToggleDoctorActive();
  const deleteDoctor        = useDeleteDoctor();

  const allDoctors    = data?.data ?? [];
  const activeCount   = allDoctors.filter((d) => d.isActive).length;
  const inactiveCount = allDoctors.filter((d) => !d.isActive).length;
  const onlineCount   = allDoctors.filter((d) => d.isOnlineDoctor).length;

  const filtered = allDoctors.filter((d) => {
    const name = lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn;
    const spec  = specialtyMap.get(d.specialtyId);
    const specName = spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : '';
    if (query && !name.toLowerCase().includes(query.toLowerCase()) && !specName.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'online')   return d.isOnlineDoctor;
    if (filter === 'active')   return d.isActive && !d.isOnlineDoctor;
    if (filter === 'inactive') return !d.isActive;
    return true;
  });

  const filterConfig: { k: FilterKey; labelEn: string; labelAr: string; count: number }[] = [
    { k: 'all',      labelEn: 'All',      labelAr: 'الكل',    count: allDoctors.length },
    { k: 'online',   labelEn: 'Online',   labelAr: 'أونلاين', count: onlineCount },
    { k: 'active',   labelEn: 'Active',   labelAr: 'نشط',     count: activeCount - onlineCount },
    { k: 'inactive', labelEn: 'On hold',  labelAr: 'غير نشط', count: inactiveCount },
  ];

  function handleToggle(d: Doctor, e: React.MouseEvent) {
    e.stopPropagation();
    toggleActive.mutate({ id: d.id, isActive: !d.isActive }, {
      onSuccess: () => toast(
        d.isActive ? t('تم تعطيل الطبيب', 'Doctor deactivated') : t('تم تفعيل الطبيب', 'Doctor activated'),
        'success',
      ),
      onError: () => toast(t('تعذّر تحديث الحالة', "Couldn't update status"), 'error'),
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteDoctor.mutate(deleteTarget.id, {
      onSuccess: () => { toast(t('تم حذف الطبيب', 'Doctor deleted'), 'success'); setDeleteTarget(null); },
      onError:   () => toast(t('تعذّر حذف الطبيب', "Couldn't delete doctor"), 'error'),
    });
  }

  const [gridRef] = useAutoAnimate();

  return (
    <div className="fc-page">

      {/* ── Page header ── */}
      <div className="fc-page-head animate-slide-down">
        <div>
          <h2 className="fc-page-title">{t('الأطباء', 'Doctors')}</h2>
          <p className="fc-page-sub">
            {activeCount} {t('طبيب نشط', 'active doctors')}
            {onlineCount > 0 && ` · ${onlineCount} ${t('أونلاين الآن', 'online now')}`}
          </p>
        </div>
        <div className="fc-page-actions">
          <button className="fc-btn fc-btn-primary fc-btn-sm" onClick={() => setAddOpen(true)}>
            <Stethoscope size={14} />
            {t('إضافة طبيب', 'Add Doctor')}
          </button>
        </div>
      </div>

      {/* ── KPI row (4 horizontal tiles) ── */}
      <div className="fc-dr-kpi-row animate-slide-up">

        {/* Total */}
        <div className="fc-dr-kpi">
          <div className="fc-dr-kpi-icon" style={{ background: '#FEE2E2', color: '#B71C1C' }}>
            <Stethoscope size={18} />
          </div>
          <div className="fc-dr-kpi-meta">
            <div className="fc-dr-kpi-value">{isLoading ? '…' : allDoctors.length}</div>
            <div className="fc-dr-kpi-label">{t('إجمالي الأطباء', 'Total doctors')}</div>
          </div>
          <Sparkline data={[18, 20, 22, 23, 24, 26, allDoctors.length || 27]} color="#B71C1C" />
        </div>

        {/* Active */}
        <div className="fc-dr-kpi">
          <div className="fc-dr-kpi-icon" style={{ background: '#D1FAE5', color: '#047857' }}>
            <Users size={18} />
          </div>
          <div className="fc-dr-kpi-meta">
            <div className="fc-dr-kpi-value">{isLoading ? '…' : activeCount}</div>
            <div className="fc-dr-kpi-label">{t('نشط', 'Active')}</div>
          </div>
          <Sparkline data={[12, 18, 20, 22, 24, 26, activeCount || 27]} color="#10B981" />
        </div>

        {/* Inactive */}
        <div className="fc-dr-kpi">
          <div className="fc-dr-kpi-icon" style={{ background: 'rgba(148,163,184,0.18)', color: '#94A3B8' }}>
            <PowerOff size={18} />
          </div>
          <div className="fc-dr-kpi-meta">
            <div className="fc-dr-kpi-value">{isLoading ? '…' : inactiveCount}</div>
            <div className="fc-dr-kpi-label">{t('غير نشط', 'On hold')}</div>
          </div>
          {inactiveCount === 0
            ? <span className="fc-dr-kpi-empty">{t('الكل نشط ✓', 'All active ✓')}</span>
            : <Sparkline data={[2, 3, 2, 1, 2, 1, inactiveCount]} color="#94A3B8" />
          }
        </div>

        {/* Online */}
        <div className="fc-dr-kpi">
          <div className="fc-dr-kpi-icon" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
            <Wifi size={18} />
          </div>
          <div className="fc-dr-kpi-meta">
            <div className="fc-dr-kpi-value">
              {isLoading ? '…' : onlineCount}
              {onlineCount > 0 && (
                <span className="fc-dr-kpi-live">
                  <span className="fc-dr-kpi-live-dot" />
                  LIVE
                </span>
              )}
            </div>
            <div className="fc-dr-kpi-label">{t('أونلاين الآن', 'Online now')}</div>
          </div>
          <Sparkline data={[3, 4, 3, 5, 6, 4, onlineCount || 5]} color="#3B82F6" />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="fc-dr-toolbar animate-slide-up" style={{ animationDelay: '40ms' }}>
        <div className="fc-dr-search">
          <Search size={15} className="fc-dr-search-icon" />
          <input
            placeholder={t('بحث بالاسم أو التخصص…', 'Search by name or specialty…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="fc-dr-search-clear" onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>

        <div className="fc-dr-filters">
          {filterConfig.map((f) => (
            <button
              key={f.k}
              className={`fc-dr-filter${filter === f.k ? ' is-on' : ''}`}
              onClick={() => setFilter(f.k)}
            >
              {lang === 'ar' ? f.labelAr : f.labelEn}
              <span className="fc-dr-filter-count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Doctor card grid ── */}
      {!isLoading && filtered.length > 0 && (
        <div className="fc-dr-grid" ref={gridRef}>
          {filtered.map((doc, idx) => {
            const name   = lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn;
            const spec   = specialtyMap.get(doc.specialtyId);
            const specName = spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${doc.specialtyId}`;
            const st     = STATUS_MAP[doctorStatus(doc)];
            return (
              <div
                key={doc.id}
                className="fc-dr-card"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/doctors/${doc.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/doctors/${doc.id}`); } }}
              >
                {/* Avatar */}
                <div
                  className="fc-dr-avatar"
                  style={{ background: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] }}
                  aria-label={name}
                >
                  {name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="fc-dr-info">
                  <div className="fc-dr-name-row">
                    <span className="fc-dr-name">{name}</span>
                    <span className="fc-dr-status" style={{ background: st.bg, color: st.fg }}>
                      <span className="fc-dr-status-dot" style={{ background: st.dot }} />
                      {lang === 'ar' ? st.label.ar : st.label.en}
                    </span>
                  </div>
                  <div className="fc-dr-spec">{specName}</div>
                  <div className="fc-dr-meta">
                    <span className="fc-dr-meta-item" style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}>
                      {doc.mobile}
                    </span>
                    {doc.isOnlineDoctor && (
                      <span className="fc-dr-meta-item" style={{ color: '#1E40AF' }}>
                        <Wifi size={10} />
                        {t('أونلاين', 'Online')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hover actions */}
                {/* click-shield so row navigation doesn't fire from the action strip */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                <div className="fc-dr-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="fc-dr-act"
                    title={t('الجدول', 'Schedule')}
                    onClick={(e) => { e.stopPropagation(); router.push(`/doctors/${doc.id}/schedule`); }}
                  >
                    <Calendar size={13} />
                  </button>
                  <button
                    className="fc-dr-act"
                    title={doc.isActive ? t('تعطيل', 'Deactivate') : t('تفعيل', 'Activate')}
                    onClick={(e) => handleToggle(doc, e)}
                  >
                    {doc.isActive ? <PowerOff size={13} /> : <Power size={13} />}
                  </button>
                  <button
                    className="fc-dr-act"
                    title={t('تعديل', 'Edit')}
                    onClick={(e) => { e.stopPropagation(); setEditDoctor(doc); }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="fc-dr-act fc-dr-act-warn"
                    title={t('حذف', 'Delete')}
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* View profile arrow — bottom-right */}
                <ChevronRight
                  size={14}
                  style={{
                    position: 'absolute', bottom: 14, right: 14,
                    color: 'var(--color-gray-300)',
                    transition: 'color .15s',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="fc-dr-grid animate-slide-up" style={{ animationDelay: '80ms' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="fc-dr-card" style={{ pointerEvents: 'none' }}>
              <div className="fc-dr-avatar" style={{ background: '#F3F4F6' }} />
              <div className="fc-dr-info" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 13, width: 140, background: '#F3F4F6', borderRadius: 9999 }} />
                <div style={{ height: 11, width: 90,  background: '#F3F4F6', borderRadius: 9999 }} />
                <div style={{ height: 10, width: 110, background: '#F3F4F6', borderRadius: 9999, marginTop: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title={t('لا يوجد أطباء', 'No doctors match')}
          description={t('جرّب بحثاً مختلفاً أو امسح الفلتر', 'Try clearing the filter or adjusting your search.')}
        />
      )}

      {/* ── Modals ── */}
      <AddDoctorModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => setAddOpen(false)} />

      {editDoctor && (
        <EditDoctorModal open={!!editDoctor} onClose={() => setEditDoctor(null)} doctor={editDoctor} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleteDoctor.isPending}
        title={t('حذف الطبيب', 'Delete Doctor')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف د. ${deleteTarget.nameAr ?? deleteTarget.nameEn}؟ لا يمكن التراجع.`,
                `Delete Dr. ${deleteTarget.nameEn}? Their profile will be removed permanently.`,
              )
            : ''
        }
        confirmLabel={t('حذف', 'Delete')}
      />
    </div>
  );
}
