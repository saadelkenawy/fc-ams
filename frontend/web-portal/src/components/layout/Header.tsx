'use client';

import { Bell, Search, Sun, Moon, Globe, LayoutGrid, Minus, Plus } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Density = 'compact' | 'comfortable' | 'spacious';
const DENSITIES: { key: Density; labelAr: string; labelEn: string }[] = [
  { key: 'compact',     labelAr: 'مضغوط',    labelEn: 'Compact'     },
  { key: 'comfortable', labelAr: 'عادي',      labelEn: 'Comfortable' },
  { key: 'spacious',    labelAr: 'واسع',      labelEn: 'Spacious'    },
];
const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
type TextSize = typeof TEXT_SIZES[number];

export function Header() {
  const { lang, toggle, t }     = useLang();
  const { user }                = useAuth();
  const [dark, setDark]         = useState(false);
  const [notifCount]            = useState(3);
  const [density, setDensity]   = useState<Density>('comfortable');
  const [textSize, setTextSize] = useState<TextSize>('md');
  const [showDensity, setShowDensity] = useState(false);

  function toggleTheme() {
    setDark((d) => {
      document.documentElement.setAttribute('data-theme', d ? 'light' : 'dark');
      return !d;
    });
  }

  const applyDensity = useCallback((d: Density) => {
    document.documentElement.setAttribute('data-density', d);
    setDensity(d);
    setShowDensity(false);
  }, []);

  function zoomOut() {
    const idx = TEXT_SIZES.indexOf(textSize);
    if (idx > 0) {
      const next = TEXT_SIZES[idx - 1];
      document.documentElement.setAttribute('data-text-size', next);
      setTextSize(next);
    }
  }

  function zoomIn() {
    const idx = TEXT_SIZES.indexOf(textSize);
    if (idx < TEXT_SIZES.length - 1) {
      const next = TEXT_SIZES[idx + 1];
      document.documentElement.setAttribute('data-text-size', next);
      setTextSize(next);
    }
  }

  const userName = lang === 'ar' ? user?.nameAr : user?.nameEn;

  return (
    <header className="h-14 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 flex items-center px-5 gap-4 flex-shrink-0 transition-colors duration-200">
      {/* Search */}
      <div className="flex-1 max-w-xs">
        <Input
          placeholder={t('بحث سريع...', 'Quick search...')}
          icon={<Search className="w-3.5 h-3.5" />}
          className="h-8 text-xs"
          lang={lang}
        />
      </div>

      <div className="flex items-center gap-1 ms-auto">
        {/* Zoom controls */}
        <div className="flex items-center gap-0 bg-gray-100 dark:bg-neutral-800 rounded-lg overflow-hidden me-1">
          <button
            onClick={zoomOut}
            disabled={textSize === 'sm'}
            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            title={t('تصغير النص', 'Decrease font')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-xs font-mono text-gray-600 dark:text-gray-300 select-none border-x border-gray-200 dark:border-neutral-700">{textSize.toUpperCase()}</span>
          <button
            onClick={zoomIn}
            disabled={textSize === 'xl'}
            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            title={t('تكبير النص', 'Increase font')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Density picker */}
        <div className="relative me-1">
          <button
            onClick={() => setShowDensity((s) => !s)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors text-xs font-medium"
            title={t('كثافة العرض', 'Display density')}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(DENSITIES.find((d) => d.key === density)!.labelAr, DENSITIES.find((d) => d.key === density)!.labelEn)}</span>
          </button>
          {showDensity && (
            <div className="absolute top-10 end-0 z-50 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-700 overflow-hidden min-w-[140px] animate-slide-down">
              {DENSITIES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => applyDensity(d.key)}
                  className={cn(
                    'w-full text-start px-4 py-2.5 text-sm transition-colors',
                    density === d.key
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700',
                  )}
                >
                  {lang === 'ar' ? d.labelAr : d.labelEn}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language toggle */}
        <Button variant="ghost" size="icon" onClick={toggle} title={t('English', 'عربي')} className="h-8 w-8">
          <Globe className="w-4 h-4" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost" size="icon"
          onClick={toggleTheme}
          title={dark ? t('وضع النهار', 'Light mode') : t('وضع الليل', 'Dark mode')}
          className="h-8 w-8"
        >
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-8 w-8 me-2">
          <Bell className="w-4 h-4" />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 bg-primary-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
              {notifCount}
            </span>
          )}
        </Button>

        {/* User pill */}
        {userName && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-gray-200 dark:border-neutral-700">
            <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {userName.charAt(0)}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-none">{userName}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 capitalize leading-none mt-0.5">{user?.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
