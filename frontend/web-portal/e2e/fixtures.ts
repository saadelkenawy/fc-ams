import { test as base, expect, type BrowserContext } from '@playwright/test';

/**
 * Identity rotates the refresh token on EVERY /api/auth/refresh (old token is
 * revoked immediately), so the stock Playwright pattern — many fresh contexts
 * sharing one storageState file — self-destructs: the first context's refresh
 * invalidates the cookie for all the others and they bounce to /login.
 * Login is also rate-limited (5/min/IP), so per-test logins are out.
 *
 * Instead each WORKER logs in once into a long-lived context (its cookie jar
 * follows rotations like a real browser would) and every test gets a fresh
 * page in that context.
 */

const ACCOUNTS = {
  admin: {
    email: process.env.E2E_EMAIL ?? 'admin@fadlclinic.com',
    password: process.env.E2E_PASSWORD ?? 'Admin@123',
  },
  receptionist: {
    email: process.env.E2E_RECEP_EMAIL ?? 'enawy.recep@fadlclinic.com',
    password: process.env.E2E_RECEP_PASSWORD ?? '123456789',
  },
} as const;

export type AccountOptions = { account: 'admin' | 'receptionist' };
type WorkerFixtures = AccountOptions & { authedContext: BrowserContext };

export const test = base.extend<object, WorkerFixtures>({
  account: ['admin', { option: true, scope: 'worker' }],

  authedContext: [
    async ({ browser, account }, use) => {
      const context = await browser.newContext();
      // context.request shares the context's cookie jar, so the Set-Cookie
      // pair from the portal route lands where the pages will look for it.
      const res = await context.request.post('/api/auth/login', { data: ACCOUNTS[account] });
      if (!res.ok()) {
        throw new Error(`e2e login as ${account} failed: HTTP ${res.status()} ${await res.text()}`);
      }
      // AuthContext only attempts the cookie-based session restore when a
      // cached `fadl_user` exists in localStorage (the UI login writes it) —
      // without it every page treats the session as logged out.
      const { data } = (await res.json()) as { data: { user: unknown } };
      await context.addInitScript(
        (user) => localStorage.setItem('fadl_user', JSON.stringify(user)),
        data.user,
      );
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  page: async ({ authedContext }, use) => {
    const page = await authedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
