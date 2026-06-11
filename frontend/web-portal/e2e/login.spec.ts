import { test, expect } from '@playwright/test';

/**
 * UI login smoke test (deliberately on the plain, unauthenticated fixtures —
 * the visual suites log in via the API instead, see fixtures.ts).
 */
const ADMIN_EMAIL = process.env.E2E_EMAIL ?? 'admin@fadlclinic.com';
const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123';

test('admin can log in through the UI', async ({ page }) => {
  // Force English so the role buttons render their English labels.
  await page.addInitScript(() => localStorage.setItem('fadl_lang', 'en'));
  await page.goto('/login');

  // The page defaults to the "Receptionist" role; logging in with a role that
  // doesn't match the account makes the page log straight back out.
  await page.getByRole('button', { name: 'Admin', exact: true }).click();

  const email = page.getByPlaceholder('admin@fadlclinic.com');
  await email.fill(ADMIN_EMAIL);
  // Re-fill if hydration raced the first fill and wiped controlled state.
  await expect(email).toHaveValue(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);

  const loginResponse = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.locator('button[type="submit"]').click();
  const res = await loginResponse;
  expect(res.status(), `login API returned ${res.status()}`).toBe(200);

  await page.waitForURL(/\/(\?.*)?$/, { timeout: 20_000 });
});
