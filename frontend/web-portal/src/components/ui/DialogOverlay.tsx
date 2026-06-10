'use client';

import { useEffect, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';

interface DialogOverlayProps {
  onClose: () => void;
  /** Accessible name for the dialog (aria-label). */
  label: string;
  /** Classes for the full-screen overlay (positioning/backdrop). */
  overlayClassName: string;
  /** Classes for the dialog panel itself. */
  panelClassName: string;
  /** Set false for destructive flows that must be cancelled explicitly (Escape still works). */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible replacement for the inline `fixed inset-0` modal pattern used on
 * dashboard pages: provides role="dialog", aria-modal, Escape-to-close,
 * click-outside-to-close, a focus trap, and focus restoration — while leaving
 * all visual styling to the caller. For standard modals prefer <Modal/>.
 */
export function DialogOverlay({ onClose, label, overlayClassName, panelClassName, closeOnBackdrop = true, children }: DialogOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Focus management: remember opener, focus the panel, restore on unmount
  useEffect(() => {
    triggerRef.current = document.activeElement;
    const els = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SEL);
    (els?.[0] ?? panelRef.current)?.focus();
    return () => { (triggerRef.current as HTMLElement | null)?.focus(); };
  }, []);

  // Escape closes; Tab wraps within the panel
  function onPanelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    // Backdrop click-to-close is a pointer convenience; Escape is the
    // keyboard equivalent (handled on the panel), so no key handler here.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={overlayClassName}
      role="presentation"
      onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      {/* The keydown handler implements the dialog pattern (Escape + focus
          trap); role="dialog" is interactive by contract even though the
          static-element rule can't see it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={panelClassName}
        onKeyDown={onPanelKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
