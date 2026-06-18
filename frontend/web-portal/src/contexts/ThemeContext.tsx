'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEMES, THEME_ORDER, type ThemeId } from '@/lib/theme.config';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => undefined,
  cycleTheme: () => undefined,
});

const STORAGE_KEY = 'fadl_theme';

function applyTheme(id: ThemeId) {
  const t = THEMES[id];
  const root = document.documentElement;
  root.setAttribute('data-theme', id);
  // Bridge to CoreUI's theming so its components follow the same light/dark state.
  root.setAttribute('data-coreui-theme', id === 'dark' ? 'dark' : 'light');
  root.style.setProperty('--color-bg',             t.bg);
  root.style.setProperty('--color-bg-elevated',    t.elevated);
  root.style.setProperty('--color-bg-card',        t.card);
  root.style.setProperty('--color-bg-input',       t.input);
  root.style.setProperty('--color-border',         t.border);
  root.style.setProperty('--color-border-strong',  t.borderStrong);
  root.style.setProperty('--color-text-primary',   t.textPrimary);
  root.style.setProperty('--color-text-secondary', t.textSecondary);
  root.style.setProperty('--color-text-tertiary',  t.textTertiary);
  root.style.setProperty('--color-text-disabled',  t.textDisabled);
  root.style.setProperty('--gradient-glass',       t.gradientGlass);
  root.style.setProperty('--gradient-sidebar',     t.gradientSidebar);
  root.style.setProperty('--theme-primary-from',   t.primaryFrom);
  root.style.setProperty('--theme-primary-to',     t.primaryTo);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('light');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) ?? 'light') as ThemeId;
    const valid = THEMES[stored] ? stored : 'light';
    setThemeState(valid);
    applyTheme(valid);

    const storedSize = localStorage.getItem('fadl_text_size');
    if (storedSize && ['sm', 'md', 'lg', 'xl'].includes(storedSize)) {
      document.documentElement.dataset.textSize = storedSize;
    }
  }, []);

  function setTheme(id: ThemeId) {
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyTheme(id);
  }

  function cycleTheme() {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
