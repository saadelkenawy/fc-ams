import { defineConfig, devices } from '@playwright/test';
import type { AccountOptions } from './e2e/fixtures';

/**
 * Visual snapshots (§5.4) against the running dev stack's web-portal
 * (docker compose up — host port 3010). Not a CI gate: baselines live in
 * e2e/__screenshots__ and are regenerated with
 *   pnpm test:visual --update-snapshots
 * after intentional UI changes; live data drift is tolerated via
 * maxDiffPixelRatio.
 */
export default defineConfig<AccountOptions>({
  testDir: './e2e',
  outputDir: './e2e/.results',
  timeout: 60_000,
  retries: 0,
  workers: 2,
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PORTAL_URL ?? 'http://localhost:3010',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'login', testMatch: /login\.spec\.ts/ },
    {
      name: 'confirmations',
      testMatch: /confirmations\.spec\.ts/,
      use: { account: 'admin' },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: { account: 'admin' },
    },
    {
      name: 'visual-receptionist',
      testMatch: /visual-receptionist\.spec\.ts/,
      use: { account: 'receptionist' },
    },
  ],
});
