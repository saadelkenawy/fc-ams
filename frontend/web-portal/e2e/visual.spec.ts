import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/**
 * Visual snapshots of the ported pages in light/dark × LTR/RTL (§5.4).
 * Data comes from the live dev stack, so baselines are refreshed with
 * --update-snapshots after intentional UI or seed-data changes.
 */
const PAGES: Array<{ name: string; path: string; ready?: string }> = [
  { name: 'dashboard', path: '/' },
  // `ready`: capture raced the FTS data query once — height jumped 948→1213px
  // between baseline and verify. Wait for a real row (skeleton rows share
  // .fc-pt-row but only loaded rows render the .fc-pt-act buttons).
  { name: 'patients', path: '/patients', ready: '.fc-pt-row .fc-pt-act' },
  { name: 'doctors', path: '/doctors' },
  { name: 'appointments', path: '/appointments' },
  { name: 'billing', path: '/billing' },
  { name: 'encounters', path: '/encounters' },
];

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
  test.describe(variant.name, () => {
    for (const { name, path, ready } of PAGES) {
      test(`${name} (${variant.name})`, async ({ page }) => {
        await applyVariant(page, variant.theme, variant.lang);
        await page.goto(path);
        // Let data queries settle; skeletons/spinners should be gone.
        await page.waitForLoadState('networkidle');
        if (ready) await page.waitForSelector(ready, { timeout: 15_000 });
        await page.waitForTimeout(750);
        await expect(page).toHaveScreenshot(`${name}--${variant.name}.png`, { fullPage: true });
      });
    }
  });
}
