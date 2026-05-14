import { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { AppointmentStatus } from '@fadl/types';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:  'bg-gray-100 dark:bg-neutral-700   text-gray-700  dark:text-gray-300',
        primary:  'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300',
        success:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
        warning:  'bg-amber-100   dark:bg-amber-900/40   text-amber-700  dark:text-amber-300',
        danger:   'bg-red-100     dark:bg-red-900/40     text-red-700    dark:text-red-300',
        info:     'bg-blue-100    dark:bg-blue-900/40    text-blue-700   dark:text-blue-300',
        purple:   'bg-violet-100  dark:bg-violet-900/40  text-violet-700 dark:text-violet-300',
        outline:  'border border-gray-200 dark:border-neutral-600 text-gray-700 dark:text-gray-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; labelAr: string; variant: BadgeProps['variant']; icon: string }> = {
  'TBC':   { label: 'TBC',        labelAr: 'انتظار', variant: 'warning', icon: '⌛' },
  'Ok!':   { label: 'Ok!',        labelAr: 'موافق',  variant: 'info',    icon: '✓'  },
  'Conf.': { label: 'Confirmed',  labelAr: 'مؤكد',   variant: 'success', icon: '✓✓' },
  'Comp.': { label: 'Complete',   labelAr: 'مكتمل',  variant: 'default', icon: '✔'  },
  'Canc.': { label: 'Cancelled',  labelAr: 'ملغي',   variant: 'danger',  icon: '✕'  },
  'Resch.':{ label: 'Rescheduled',labelAr: 'معاد',   variant: 'purple',  icon: '↻'  },
  'Inf.':  { label: 'Informed',   labelAr: 'مُبلَّغ',variant: 'default', icon: 'ⓘ' },
  'Ref.':  { label: 'Refunded',   labelAr: 'مسترد',  variant: 'purple',  icon: '↩' },
};

export function AppointmentStatusBadge({ status, lang = 'ar' }: { status: AppointmentStatus; lang?: 'ar' | 'en' }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant={cfg.variant} dot>
      {lang === 'ar' ? cfg.labelAr : cfg.label}
    </Badge>
  );
}
