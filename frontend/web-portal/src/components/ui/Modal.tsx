'use client';

import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  stretch?: boolean;
  footer?: ReactNode;
}

const MAX_WIDTH = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full:  'max-w-full mx-4',
} as const;

const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, subtitle, children, maxWidth = 'xl', stretch = false, footer }: ModalProps) {
  const { t } = useLang();
  const labelId   = useId();
  const panelRef  = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Capture the element that opened the modal; restore focus on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    } else {
      (triggerRef.current as HTMLElement | null)?.focus();
    }
  }, [open]);

  // Body scroll lock + Escape to close
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Focus trap: auto-focus first element, wrap Tab/Shift-Tab within the panel
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;

    const getEls = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter(
        (el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'),
      );

    // Auto-focus the first focusable element
    getEls()[0]?.focus();

    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const els = getEls();
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0];
      const last  = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={cn('modal-panel', MAX_WIDTH[maxWidth], stretch && 'flex flex-col h-[90vh]')}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-neutral-800">
          <div>
            <h2 id={labelId} className="text-lg font-bold text-gray-900 dark:text-gray-100 font-display">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={t('إغلاق', 'Close')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors ms-4 flex-shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body — overflow-visible so dropdowns inside can escape the panel */}
        <div className={cn('px-6 py-5 overflow-y-auto overflow-x-visible', stretch ? 'flex-1' : 'max-h-[80vh]')}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-950/30 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
