'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success', duration = 4500) => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-5 end-5 z-[9999] flex flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TYPE_CONFIG = {
  success: {
    Icon:        CheckCircle,
    iconColor:   'text-emerald-500',
    iconBg:      'bg-emerald-50 dark:bg-emerald-500/10',
    accentBorder:'border-s-emerald-400 dark:border-s-emerald-500/50',
    bar:         'bg-emerald-400 dark:bg-emerald-500',
    glow:        '0 0 0 1px rgba(52,211,153,0.12), 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
  },
  error: {
    Icon:        XCircle,
    iconColor:   'text-primary-500',
    iconBg:      'bg-primary-50 dark:bg-primary-500/10',
    accentBorder:'border-s-primary-400 dark:border-s-primary-500/50',
    bar:         'bg-primary-500',
    glow:        '0 0 0 1px rgba(239,68,68,0.12), 0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
  },
  warning: {
    Icon:        AlertTriangle,
    iconColor:   'text-amber-500',
    iconBg:      'bg-amber-50 dark:bg-amber-500/10',
    accentBorder:'border-s-amber-400 dark:border-s-amber-500/50',
    bar:         'bg-amber-400 dark:bg-amber-500',
    glow:        '0 0 0 1px rgba(245,158,11,0.12), 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
  },
} satisfies Record<ToastType, object>;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const cfg = TYPE_CONFIG[toast.type];
  const { Icon } = cfg;

  useEffect(() => {
    const el = barRef.current;
    if (!el || !toast.duration) return;
    el.style.transition = `width ${toast.duration}ms linear`;
    requestAnimationFrame(() => { el.style.width = '0%'; });
  }, [toast.duration]);

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto relative flex items-start gap-3',
        'min-w-[300px] max-w-[400px] px-4 py-3.5 rounded-xl overflow-hidden',
        // glass base
        'bg-white/85 dark:bg-neutral-900/85',
        'backdrop-blur-xl backdrop-saturate-150',
        // borders: subtle outer + colored left accent
        'border border-gray-200/70 dark:border-neutral-700/60',
        'border-s-2', cfg.accentBorder,
        'animate-slide-in-right',
      )}
      style={{ boxShadow: cfg.glow }}
    >
      {/* Icon badge */}
      <div className={cn(
        'flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg mt-0.5',
        cfg.iconBg,
      )}>
        <Icon className={cn('w-4 h-4', cfg.iconColor)} />
      </div>

      {/* Message */}
      <p className="flex-1 pt-0.5 text-sm leading-snug text-gray-800 dark:text-gray-100">
        {toast.message}
      </p>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className={cn(
          'flex-shrink-0 mt-0.5 p-0.5 rounded-md transition-colors',
          'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
          'hover:bg-gray-100/80 dark:hover:bg-neutral-800',
        )}
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      {toast.duration && (
        <div
          ref={barRef}
          className={cn('absolute bottom-0 start-0 h-0.5 w-full opacity-70', cfg.bar)}
        />
      )}
    </div>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
