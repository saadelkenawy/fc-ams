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
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-6 gap-4 flex-shrink-0">
      {/* Page title */}
      {(title ?? titleAr) && (
        <h1 className="text-lg font-semibold text-gray-900 font-display me-auto">
          {lang === 'ar' ? (titleAr ?? title) : (title ?? titleAr)}
        </h1>
      )}

      {/* Search */}
      <div className={cn('flex-1 max-w-sm', !(title ?? titleAr) && 'ms-0')}>
        <Input
          placeholder={t('بحث...', 'Search...')}
          icon={<Search className="w-4 h-4" />}
          className="h-9 text-sm"
          lang={lang}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ms-auto">
        {/* Language toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={t('English', 'عربي')}
          className="text-gray-500 hover:text-primary-600"
        >
          <Globe className="w-4 h-4" />
        </Button>

        {/* Dark mode */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-gray-500 hover:text-primary-600"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative text-gray-500 hover:text-primary-600">
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
