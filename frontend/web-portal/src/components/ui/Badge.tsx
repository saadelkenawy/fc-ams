import { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { AppointmentStatus } from '@fadl/types';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:  'bg-gray-100 text-gray-700',
        primary:  'bg-primary-100 text-primary-700',
        success:  'bg-emerald-100 text-emerald-700',
        warning:  'bg-amber-100 text-amber-700',
        danger:   'bg-red-100 text-red-700',
        info:     'bg-blue-100 text-blue-700',
        purple:   'bg-violet-100 text-violet-700',
        outline:  'border border-gray-200 text-gray-700',
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
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full bg-current')} />}
      {children}
    </span>
  );
}

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; labelAr: string; variant: BadgeProps['variant']; icon: string }> = {
  'TBC':   { label: 'TBC',       labelAr: 'انتظار',    variant: 'warning', icon: '⌛' },
  'Ok!':   { label: 'Ok!',       labelAr: 'موافق',     variant: 'info',    icon: '✓'  },
  'Conf.': { label: 'Confirmed', labelAr: 'مؤكد',      variant: 'success', icon: '✓✓' },
  'Comp.': { label: 'Complete',  labelAr: 'مكتمل',     variant: 'default', icon: '✔'  },
  'Canc.': { label: 'Cancelled', labelAr: 'ملغي',      variant: 'danger',  icon: '✕'  },
  'Resch.':{ label: 'Rescheduled',labelAr: 'معاد',     variant: 'purple',  icon: '↻'  },
  'Inf.':  { label: 'Informed',  labelAr: 'مُبلَّغ',   variant: 'default', icon: 'ⓘ' },
};

export function AppointmentStatusBadge({ status, lang = 'ar' }: { status: AppointmentStatus; lang?: 'ar' | 'en' }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant={cfg.variant} dot>
      {lang === 'ar' ? cfg.labelAr : cfg.label}
    </Badge>
  );
}
