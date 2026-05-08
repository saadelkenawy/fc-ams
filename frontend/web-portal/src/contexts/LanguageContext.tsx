'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Lang = 'ar' | 'en';

interface LanguageContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  toggle: () => void;
  t: (ar: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar');

  useEffect(() => {
    const stored = (localStorage.getItem('fadl_lang') as Lang) ?? 'ar';
    setLang(stored);
    document.documentElement.lang = stored;
    document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = stored === 'ar' ? 'rtl' : 'ltr';
  }, []);

  function toggle() {
    const next: Lang = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    localStorage.setItem('fadl_lang', next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = next === 'ar' ? 'rtl' : 'ltr';
  }

  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
