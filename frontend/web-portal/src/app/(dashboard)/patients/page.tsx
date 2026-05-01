'use client';

import { useState } from 'react';
import { Search, Plus, Filter, MoreHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { formatDate } from '@/lib/utils';

const MOCK_PATIENTS = [
  { id: 'p001', nameAr: 'سارة محمود أحمد', nameEn: 'Sara Mahmoud Ahmed', mobile: '+201012345678', nationalId: '29901011234567', dob: '1999-01-01', gender: 'F', source: "Cl.'s", lastVisit: '2026-05-02', visits: 8 },
  { id: 'p002', nameAr: 'أحمد حسن علي',    nameEn: 'Ahmed Hassan Ali',   mobile: '+201123456789', nationalId: '28505051234568', dob: '1985-05-05', gender: 'M', source: 'VEZ',    lastVisit: '2026-05-01', visits: 3 },
  { id: 'p003', nameAr: 'منى سامي عبد الله', nameEn: 'Mona Sami Abdullah', mobile: '+201234567890', nationalId: '29203031234569', dob: '1992-03-03', gender: 'F', source: 'EKF',    lastVisit: '2026-04-28', visits: 1 },
  { id: 'p004', nameAr: 'خالد عمر إبراهيم', nameEn: 'Khaled Omar Ibrahim', mobile: '+201098765432', nationalId: '27807071234570', dob: '1978-07-07', gender: 'M', source: "Dr.'s", lastVisit: '2026-04-25', visits: 15 },
  { id: 'p005', nameAr: 'نادية رمضان سعيد', nameEn: 'Nadia Ramadan Said', mobile: '+201187654321', nationalId: '29610101234571', dob: '1996-10-10', gender: 'F', source: 'SHL',   lastVisit: '2026-04-20', visits: 2 },
];

export default function PatientsPage() {
  const { lang, t } = useLang();
  const [query, setQuery] = useState('');

  const filtered = MOCK_PATIENTS.filter((p) =>
    (lang === 'ar' ? p.nameAr : p.nameEn).toLowerCase().includes(query.toLowerCase()) ||
    p.mobile.includes(query) ||
    p.nationalId.includes(query),
  );

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900">{t('المرضى', 'Patients')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t(`${MOCK_PATIENTS.length} مريض مسجل`, `${MOCK_PATIENTS.length} registered patients`)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4" />
            {t('فلتر', 'Filter')}
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4" />
            {t('مريض جديد', 'New Patient')}
          </Button>
        </div>
      </div>

      <Card>
        {/* Search bar */}
        <div className="p-5 border-b border-gray-50">
          <Input
            placeholder={t('بحث بالاسم، الموبايل، أو الرقم القومي...', 'Search by name, mobile, or national ID...')}
            icon={<Search className="w-4 h-4" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            lang={lang}
          />
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('المريض', 'Patient')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('الموبايل', 'Mobile')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('تاريخ الميلاد', 'Date of Birth')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('المصدر', 'Source')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('آخر زيارة', 'Last Visit')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('الزيارات', 'Visits')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                          {(lang === 'ar' ? p.nameAr : p.nameEn).charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{lang === 'ar' ? p.nameAr : p.nameEn}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.nationalId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">{p.mobile}</td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(p.dob, lang === 'ar' ? 'ar-EG' : 'en-US')}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={p.source === 'VEZ' || p.source === 'EKF' || p.source === 'DO' ? 'info' : 'default'}>
                        {p.source}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(p.lastVisit, lang === 'ar' ? 'ar-EG' : 'en-US')}</td>
                    <td className="px-5 py-3.5 text-gray-600 tabular-nums">{p.visits}</td>
                    <td className="px-5 py-3.5">
                      <button className="text-gray-400 hover:text-gray-600 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                      {t('لا توجد نتائج', 'No results found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
