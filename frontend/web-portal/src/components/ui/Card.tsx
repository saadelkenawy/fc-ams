import { HTMLAttributes, forwardRef } from 'react';
import { CCard, CCardBody, CCardHeader } from '@coreui/react';
import { cn } from '@/lib/utils';

/**
 * Card primitives now wrap CoreUI's CCard family so every page picks up the
 * CoreUI surface (border, radius, shadow, dark-mode) without changing call
 * sites. The original prop surface (className passthrough, ref, children) is
 * preserved. CardTitle stays a styled heading to keep the existing type ramp.
 */

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <CCard ref={ref} className={cn('shadow-sm', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <CCardHeader ref={ref} className={className} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    // Heading content arrives via {...props} children — the static rule can't see it
    // eslint-disable-next-line jsx-a11y/heading-has-content
    <h3
      ref={ref}
      className={cn('text-base font-semibold text-gray-900 dark:text-gray-100 font-display mb-0', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <CCardBody ref={ref} className={className} {...props} />
  ),
);
CardContent.displayName = 'CardContent';
