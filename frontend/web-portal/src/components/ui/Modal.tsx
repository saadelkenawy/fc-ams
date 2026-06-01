'use client';

import { useEffect, useRef, useId, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full' | '800';
  stretch?: boolean;
  footer?: ReactNode;
}

const MAX_WIDTH = {
  sm:    'max-w-sm',
  md:    'max-w-md',
  lg:    'max-w-lg',
  xl:    'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full:  'max-w-full mx-4',
  '800': 'max-w-[800px]',
} as const;

const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export function Modal({ open, onClose, title, subtitle, children, maxWidth = 'xl', stretch = false, footer }: ModalProps) {
  const { t } = useLang();
  const labelId      = useId();
  const panelRef     = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<Element | null>(null);
  const reducedMotion = useReducedMotion();

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
            className={cn('modal-panel', MAX_WIDTH[maxWidth], stretch && 'flex flex-col h-[90vh]')}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : 12 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[var(--color-gray-100)]">
              <div>
                <h2 id={labelId} className="text-lg font-bold text-[var(--color-gray-900)] font-display">{title}</h2>
                {subtitle && <p className="text-sm text-[var(--color-gray-500)] mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label={t('إغلاق', 'Close')}
                className="p-1.5 rounded-lg text-[var(--color-gray-400)] hover:text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)] transition-colors ms-4 flex-shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Body */}
            <div className={cn('px-6 py-5 overflow-y-auto overflow-x-visible', stretch ? 'flex-1' : 'max-h-[80vh]')}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 border-t border-[var(--color-gray-100)] bg-[var(--color-gray-50)] flex items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
