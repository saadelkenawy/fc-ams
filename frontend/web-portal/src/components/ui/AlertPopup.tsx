'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, AlertOctagon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'critical';

export interface AlertAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost';
}

export interface AlertOptions {
  type?: AlertType;
  title: string;
  message?: string;
  /** Auto-dismiss after ms. 0 = manual dismiss only. Default: 0 */
  duration?: number;
  actions?: AlertAction[];
}

interface AlertCtx {
  showAlert: (opts: AlertOptions) => void;
}

const AlertContext = createContext<AlertCtx | null>(null);

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const TYPE_CFG = {
  info: {
    Icon: Info,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/30',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    bar: 'bg-blue-500',
    glow: '0 0 0 1px rgba(59,130,246,0.15),0 24px 64px rgba(0,0,0,0.14)',
    label: 'Info',
  },
  success: {
    Icon: CheckCircle,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    glow: '0 0 0 1px rgba(52,211,153,0.15),0 24px 64px rgba(0,0,0,0.14)',
    label: 'Success',
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    bar: 'bg-amber-500',
    glow: '0 0 0 1px rgba(245,158,11,0.15),0 24px 64px rgba(0,0,0,0.14)',
    label: 'Warning',
  },
  error: {
    Icon: XCircle,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50 dark:bg-red-500/10',
    border: 'border-red-200 dark:border-red-500/30',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    bar: 'bg-red-500',
    glow: '0 0 0 1px rgba(239,68,68,0.15),0 24px 64px rgba(0,0,0,0.14)',
    label: 'Error',
  },
  critical: {
    Icon: AlertOctagon,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100 dark:bg-red-600/15',
    border: 'border-red-300 dark:border-red-500/40',
    badge: 'bg-red-600 text-white',
    bar: 'bg-red-600',
    glow: '0 0 0 2px rgba(220,38,38,0.2),0 28px 72px rgba(0,0,0,0.2)',
    label: 'Critical',
  },
} as const;

let alertSeq = 0;

interface QueuedAlert extends AlertOptions {
  id: number;
  type: AlertType;
}

export function AlertPopupProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedAlert[]>([]);
  const current = queue[0] ?? null;

  const showAlert = useCallback((opts: AlertOptions) => {
    const id = ++alertSeq;
    setQueue((q) => [...q, { ...opts, type: opts.type ?? 'info', id }]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertPortal alert={current} onDismiss={dismiss} />
    </AlertContext.Provider>
  );
}

function AlertPortal({ alert, onDismiss }: { alert: QueuedAlert | null; onDismiss: () => void }) {
  const reduced   = useReducedMotion();
  const labelId   = useId();
  const descId    = useId();
  const barRef    = useRef<HTMLDivElement>(null);
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-dismiss
  useEffect(() => {
    if (!alert?.duration || alert.duration <= 0) return;
    const t = setTimeout(onDismiss, alert.duration);
    return () => clearTimeout(t);
  }, [alert?.id, alert?.duration, onDismiss]);

  // Progress bar shrink
  useEffect(() => {
    const el = barRef.current;
    if (!el || !alert?.duration) return;
    el.style.transition = `width ${alert.duration}ms linear`;
    requestAnimationFrame(() => { el.style.width = '0%'; });
  }, [alert?.id, alert?.duration]);

  // Focus first button on open
  useEffect(() => {
    if (alert) setTimeout(() => firstBtnRef.current?.focus(), 40);
  }, [alert?.id]);

  // Escape to dismiss
  useEffect(() => {
    if (!alert) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [alert?.id, onDismiss]);

  const cfg = alert ? TYPE_CFG[alert.type] : null;

  return (
    <AnimatePresence>
      {alert && cfg && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[9990] bg-black/40 backdrop-blur-[2px]"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            onClick={onDismiss}
          />

          {/* Centering shell — not interactive itself */}
          <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={labelId}
              aria-describedby={alert.message ? descId : undefined}
              className={cn(
                'relative pointer-events-auto w-full max-w-md',
                'bg-white/92 dark:bg-neutral-900/93 backdrop-blur-xl backdrop-saturate-150',
                'rounded-2xl border overflow-hidden',
                cfg.border,
              )}
              style={{ boxShadow: cfg.glow }}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.93, y: reduced ? 0 : 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.93, y: reduced ? 0 : 18 }}
              transition={{ duration: reduced ? 0 : 0.22, ease: EASE }}
            >
              {/* Body */}
              <div className="flex items-start gap-4 px-5 pt-5 pb-4">
                <div className={cn('flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center', cfg.iconBg)}>
                  <cfg.Icon className={cn('w-5 h-5', cfg.iconColor)} aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <span className={cn('inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 mb-1.5', cfg.badge)}>
                    {cfg.label}
                  </span>
                  <h3 id={labelId} className="text-sm font-semibold text-gray-900 dark:text-gray-50 leading-snug">
                    {alert.title}
                  </h3>
                  {alert.message && (
                    <p id={descId} className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {alert.message}
                    </p>
                  )}
                </div>

                <button
                  onClick={onDismiss}
                  className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action buttons */}
              {alert.actions && alert.actions.length > 0 && (
                <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-0">
                  {alert.actions.map((action, i) => (
                    <button
                      key={i}
                      ref={i === 0 ? firstBtnRef : undefined}
                      onClick={() => { action.onClick(); onDismiss(); }}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                        action.variant === 'primary'
                          ? 'bg-primary-600 hover:bg-primary-700 text-white'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800',
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Auto-dismiss progress bar */}
              {!!alert.duration && alert.duration > 0 && (
                <div
                  ref={barRef}
                  className={cn('absolute bottom-0 start-0 h-0.5 w-full opacity-60', cfg.bar)}
                />
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export function useAlert(): AlertCtx {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertPopupProvider');
  return ctx;
}
