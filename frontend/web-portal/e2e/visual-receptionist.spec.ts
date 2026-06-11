import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/**
 * Visual snapshots of the receptionist workspace in light/dark × LTR/RTL.
 * Runs as the receptionist demo account (role-scoped sidebar + queue board).
 */
const VARIANTS: Array<{ name: string; theme: 'light' | 'dark'; lang: 'en' | 'ar' }> = [
  { name: 'light-ltr', theme: 'light', lang: 'en' },
  { name: 'light-rtl', theme: 'light', lang: 'ar' },
  { name: 'dark-ltr', theme: 'dark', lang: 'en' },
  { name: 'dark-rtl', theme: 'dark', lang: 'ar' },
];

async function applyVariant(page: Page, theme: string, lang: string): Promise<void> {
  await page.addInitScript(
    ([t, l]) => {
      localStorage.setItem('fadl_theme', t);
      localStorage.setItem('fadl_lang', l);
    },
    [theme, lang],
  );
}

for (const variant of VARIANTS) {
  test(`receptionist home (${variant.name})`, async ({ page }) => {
    await applyVariant(page, variant.theme, variant.lang);
    await page.goto('/receptionist');
    // No networkidle here: the queue board keeps an SSE stream open, so the
    // network never goes idle. A fixed settle wait covers the data queries.
    await page.waitForLoadState('load');
    await page.waitForTimeout(2_500);
    await expect(page).toHaveScreenshot(`receptionist--${variant.name}.png`, { fullPage: true });
  });
}
