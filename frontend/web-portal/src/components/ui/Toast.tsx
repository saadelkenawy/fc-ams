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

  const toast = useCallback((message: string, type: ToastType = 'success', duration = 4000) => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 end-5 z-[9999] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el || !toast.duration) return;
    el.style.transition = `width ${toast.duration}ms linear`;
    requestAnimationFrame(() => { el.style.width = '0%'; });
  }, [toast.duration]);

  const icon = toast.type === 'success'
    ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
    : toast.type === 'error'
    ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
    : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;

  return (
    <div className={cn(
      'pointer-events-auto relative flex items-start gap-3 min-w-[280px] max-w-sm',
      'px-4 py-3 rounded-xl shadow-xl border overflow-hidden',
      'bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-700',
      'animate-slide-up',
    )}>
      {icon}
      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug flex-1">{toast.message}</p>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
      {toast.duration && (
        <div
          ref={barRef}
          className={cn(
            'absolute bottom-0 start-0 h-0.5 w-full',
            toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-amber-500',
          )}
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
