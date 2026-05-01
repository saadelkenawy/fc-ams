import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelAr?: string;
  error?: string;
  icon?: React.ReactNode;
  lang?: 'ar' | 'en';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, labelAr, error, icon, lang = 'ar', id, ...props }, ref) => {
    const displayLabel = lang === 'ar' ? (labelAr ?? label) : label;
    return (
      <div className="flex flex-col gap-1.5">
        {displayLabel && (
          <label htmlFor={id} className="text-sm font-medium text-gray-700">
            {displayLabel}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            className={cn(
              'w-full h-11 rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900',
              'placeholder:text-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent',
              'disabled:bg-gray-50 disabled:text-gray-500',
              'transition-shadow duration-150',
              icon && 'ps-10',
              error && 'border-red-400 focus:ring-red-500',
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
