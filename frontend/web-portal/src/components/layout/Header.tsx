'use client';

import { Bell, Search, Sun, Moon, Globe } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface HeaderProps {
  title?: string;
  titleAr?: string;
}

export function Header({ title, titleAr }: HeaderProps) {
  const { lang, toggle, t } = useLang();
  const [dark, setDark] = useState(false);
  const [notifCount] = useState(3);

  function toggleTheme() {
    setDark((d) => {
      document.documentElement.setAttribute('data-theme', d ? 'light' : 'dark');
      return !d;
    });
  }

  return (
    <header className="h-16 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 flex items-center px-6 gap-4 flex-shrink-0 transition-colors duration-200">
      {(title ?? titleAr) && (
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 font-display me-auto">
          {lang === 'ar' ? (titleAr ?? title) : (title ?? titleAr)}
        </h1>
      )}

      <div className={cn('flex-1 max-w-sm', !(title ?? titleAr) && 'ms-0')}>
        <Input
          placeholder={t('بحث...', 'Search...')}
          icon={<Search className="w-4 h-4" />}
          className="h-9 text-sm"
          lang={lang}
        />
      </div>

      <div className="flex items-center gap-1 ms-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={t('English', 'عربي')}
        >
          <Globe className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={dark ? t('وضع النهار', 'Light mode') : t('وضع الليل', 'Dark mode')}
        >
          {dark
            ? <Sun className="w-4 h-4 text-amber-400" />
            : <Moon className="w-4 h-4" />}
        </Button>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 bg-primary-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
              {notifCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}
