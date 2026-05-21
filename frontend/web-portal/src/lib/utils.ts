import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'EGP', locale = 'ar-EG'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatNumber(n: number, locale = 'ar-EG'): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDate(date: string | Date, locale = 'ar-EG'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date));
}

export function formatTime(time: string, locale: 'ar' | 'en' = 'ar'): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12
    ? (locale === 'ar' ? 'م' : 'PM')
    : (locale === 'ar' ? 'ص' : 'AM');
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}
