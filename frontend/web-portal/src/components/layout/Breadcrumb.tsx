'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';

const SEGMENT_LABELS: Record<string, { ar: string; en: string }> = {
  appointments:  { ar: 'المواعيد',       en: 'Appointments'     },
  patients:      { ar: 'المرضى',         en: 'Patients'         },
  doctors:       { ar: 'الأطباء',        en: 'Doctors'          },
  billing:       { ar: 'الفواتير',       en: 'Billing'          },
  settlements:   { ar: 'التسويات',       en: 'Settlements'      },
  analytics:     { ar: 'التحليلات',      en: 'Analytics'        },
  encounters:    { ar: 'الزيارات',       en: 'Encounters'       },
  procedures:    { ar: 'الإجراءات',      en: 'Procedures'       },
  chatbot:       { ar: 'المساعد الذكي',  en: 'AI Assistant'     },
  settings:      { ar: 'الإعدادات',      en: 'Settings'         },
  rooms:         { ar: 'الغرف',          en: 'Rooms'            },
  procurement:   { ar: 'المشتريات',      en: 'Procurement'      },
  vendors:       { ar: 'الموردون',       en: 'Vendors'          },
  catalog:       { ar: 'الكتالوج',       en: 'Catalog'          },
  receipts:      { ar: 'المستلمات',      en: 'Receipts'         },
  alerts:        { ar: 'التنبيهات',      en: 'Alerts'           },
  sources:       { ar: 'المصادر',        en: 'Sources'          },
  reports:       { ar: 'التقارير',       en: 'Reports'          },
  integrations:  { ar: 'التكاملات',      en: 'Integrations'     },
  receptionist:  { ar: 'الاستقبال',      en: 'Reception'        },
  register:      { ar: 'تسجيل مريض',    en: 'Register Patient' },
  doctor:        { ar: 'منطقتي',         en: 'My Area'          },
  earnings:      { ar: 'الأرباح',        en: 'Earnings'         },
  schedule:      { ar: 'الجدول',         en: 'Schedule'         },
};

// Context labels when a UUID segment follows these parent segments
const UUID_PARENT_LABELS: Record<string, { ar: string; en: string }> = {
  patients: { ar: 'ملف المريض', en: 'Patient Profile' },
  doctors:  { ar: 'ملف الطبيب', en: 'Doctor Profile'  },
};

function isId(segment: string): boolean {
  // UUIDs or short hex IDs
  return /^[0-9a-f-]{36}$/i.test(segment) || /^[0-9a-f]{16,}$/i.test(segment);
}

interface Crumb { label: string; href: string }

export function Breadcrumb() {
  const pathname = usePathname();
  const { lang } = useLang();

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return null;

  const crumbs: Crumb[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg  = segments[i];
    const href = '/' + segments.slice(0, i + 1).join('/');
    if (isId(seg)) {
      // Replace the ID with a context label derived from the parent segment
      const parent = segments[i - 1] ?? '';
      const ctxLabel = UUID_PARENT_LABELS[parent];
      if (ctxLabel) {
        crumbs.push({ label: lang === 'ar' ? ctxLabel.ar : ctxLabel.en, href });
      }
      continue;
    }
    const map = SEGMENT_LABELS[seg];
    crumbs.push({ label: map ? (lang === 'ar' ? map.ar : map.en) : seg, href });
  }

  if (crumbs.length <= 1) return null;

  const ChevronIcon = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <nav
      aria-label={lang === 'ar' ? 'مسار التنقل' : 'Breadcrumb'}
      className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-4 flex-wrap"
    >
      <Link
        href="/"
        className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        {lang === 'ar' ? 'الرئيسية' : 'Home'}
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            <ChevronIcon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {isLast ? (
              <span
                className="text-gray-600 dark:text-gray-400 font-medium"
                aria-current="page"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
