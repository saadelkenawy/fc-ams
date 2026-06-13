import { test, expect } from './fixtures';

/**
 * Seeded visual regression for the confirmation toggles. The page-level
 * appointments snapshot can't guard this UI — the default-date list is often
 * empty, so the toggles never appear in frame. Here we seed a known
 * appointment (doctor-confirmed, patient/room not) and screenshot the toggle
 * ELEMENTS only, which keeps the baseline deterministic regardless of the live
 * data around it.
 *
 * Setup hits the services directly on host ports — the portal /api/proxy/* is a
 * client-bearer rewrite that can't be driven from the test runner.
 */
const IDENTITY = process.env.E2E_IDENTITY_URL ?? 'http://localhost:3100/api/v1';
const APPT = process.env.E2E_APPOINTMENT_URL ?? 'http://localhost:3001/api/v1';
const EMAIL = process.env.E2E_EMAIL ?? 'admin@fadlclinic.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function svcToken(): Promise<string> {
  const res = await fetch(`${IDENTITY}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`identity login failed: ${res.status}`);
  return (await res.json()).data.accessToken as string;
}

async function api<T = unknown>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${APPT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data as T;
}

interface Appt { id: string; status: string; doctorConfirmed: boolean; patientConfirmed: boolean; version: number; doctorId: string; patientId: string; specialtyId: number; }

test('confirmation toggles render in a known state (compact + full)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fadl_lang', 'en');
    localStorage.setItem('fadl_theme', 'light');
  });

  const token = await svcToken();
  const seed = (await api<Appt[]>(token, 'GET', '/appointments?limit=1'))[0];
  expect(seed, 'need an existing appointment to borrow ids from').toBeTruthy();

  const mm = String(Math.floor(Math.random() * 58)).padStart(2, '0');
  const appt = await api<Appt>(token, 'POST', '/appointments', {
    patientId: seed.patientId, doctorId: seed.doctorId, specialtyId: seed.specialtyId,
    appointmentDate: todayLocal(), startTime: `21:${mm}`, endTime: `21:${String(Number(mm) + 1).padStart(2, '0')}`,
    appointmentType: 'online', patientSource: "Cl.'s", approvedCharge: 100, paymentMethod: 'cash',
    idempotencyKey: `e2e-vis-toggles-${Date.now()}`,
  });

  // Force a deterministic state: doctor confirmed, patient not (room is auto-off
  // for an online visit with no room). → 1/3, status stays TBC.
  const cur = await api<Appt>(token, 'GET', `/appointments/${appt.id}`);
  if (!cur.doctorConfirmed || cur.patientConfirmed) {
    await api(token, 'PATCH', `/appointments/${appt.id}/confirmations`, {
      doctorConfirmed: true, patientConfirmed: false, version: cur.version,
    });
  }

  try {
    await page.goto('/appointments');
    await page.waitForLoadState('load');

    const row = page.locator(`tr[data-appointment-id="${appt.id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Compact cluster in the row (doctor green, patient + room grey).
    const compact = row.getByTestId('confirm-toggles-compact');
    await expect(compact).toHaveAttribute('data-confirmed', '1');
    await expect(compact).toHaveScreenshot('toggles-compact-1of3.png');

    // Full labelled toggles in the status modal.
    await row.getByTestId('row-actions-menu').click();
    await page.getByTestId('action-change-status').click();
    const full = page.getByTestId('confirm-toggles-full');
    await expect(full).toBeVisible();
    await expect(full).toHaveAttribute('data-confirmed', '1');
    await expect(full).toHaveScreenshot('toggles-full-1of3.png');
  } finally {
    await fetch(`${APPT}/appointments/${appt.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: PASSWORD, reason: 'e2e visual toggles fixture cleanup' }),
    }).catch(() => { /* best-effort */ });
  }
});
