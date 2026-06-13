import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function latinNumerals(locale: string): string {
  return locale.startsWith('ar') ? `${locale}-u-nu-latn` : locale;
}

export function formatCurrency(amount: number, currency = 'EGP', locale = 'ar-EG'): string {
  return new Intl.NumberFormat(latinNumerals(locale), { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
}

export function formatNumber(n: number, locale = 'ar-EG'): string {
  return new Intl.NumberFormat(latinNumerals(locale)).format(n);
}

export function formatDate(date: string | Date, locale = 'ar-EG'): string {
  return new Intl.DateTimeFormat(latinNumerals(locale), { dateStyle: 'medium' }).format(new Date(date));
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

/** YYYY-MM-DD in the user's local timezone. `toISOString().slice(0,10)` is
 *  UTC — between midnight and UTC-offset hours it returns *yesterday*. */
export function localDateISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
