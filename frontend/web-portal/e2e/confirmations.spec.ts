import { test, expect } from './fixtures';

/**
 * Functional e2e for the appointment confirmation toggles (Doctor / Patient /
 * Room) and the auto-confirm gate (all three green → status Ok!).
 *
 * Setup talks to the services directly on their host ports — the portal's
 * /api/proxy/* is a pure rewrite that relies on a client-injected Bearer header,
 * so it can't be driven from `page.request`. The UI interaction then runs in the
 * authenticated browser page provided by the worker fixture (admin account).
 *
 * A throwaway `online` appointment is created for today: online visits skip the
 * doctor working-hours / room checks, so the seed never collides with schedules.
 * Room auto-readiness is therefore false (no room) — the test uses the manual
 * room override to reach 3/3, which is itself part of the contract.
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
  if (!res.ok) throw new Error(`identity login failed: ${res.status} ${await res.text()}`);
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

interface Appt { id: string; status: string; doctorConfirmed: boolean; patientConfirmed: boolean; doctorId: string; patientId: string; specialtyId: number; }

test('three confirmations drive the appointment to auto-confirmed (Ok!)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fadl_lang', 'en'));

  const token = await svcToken();
  const date = todayLocal();

  // Borrow a real doctor/patient/specialty from any existing appointment.
  const list = await api<Appt[]>(token, 'GET', '/appointments?limit=1');
  expect(list.length, 'need at least one existing appointment to borrow ids from').toBeGreaterThan(0);
  const seed = list[0];

  // Unique late-evening time keeps clear of the double-booking exclusion constraint.
  const mm = String(Math.floor(Math.random() * 58)).padStart(2, '0');
  const created = await api<{ id: string }>(token, 'POST', '/appointments', {
    patientId: seed.patientId,
    doctorId: seed.doctorId,
    specialtyId: seed.specialtyId,
    appointmentDate: date,
    startTime: `23:${mm}`,
    endTime: `23:${String(Math.min(59, Number(mm) + 1)).padStart(2, '0')}`,
    appointmentType: 'online',
    patientSource: "Cl.'s",
    approvedCharge: 100,
    paymentMethod: 'cash',
    idempotencyKey: `e2e-confirm-${Date.now()}`,
  });
  const id = created.id;

  try {
    await page.goto('/appointments');
    await page.waitForLoadState('load');

    const row = page.locator(`tr[data-appointment-id="${id}"]`);
    await expect(row, 'created appointment should appear in today\'s list').toBeVisible({ timeout: 15_000 });

    const doctorBtn = row.getByTestId('confirm-doctor');
    const patientBtn = row.getByTestId('confirm-patient');
    const roomBtn = row.getByTestId('confirm-room');

    // Start state: nothing confirmed.
    await expect(doctorBtn).toHaveAttribute('data-on', 'false');
    await expect(row.getByTestId('confirm-toggles-compact')).toHaveAttribute('data-confirmed', '0');

    // Toggle doctor → patient. Room is auto-false (online, no room) so status
    // must stay TBC until the manual room override.
    await doctorBtn.click();
    await expect(doctorBtn).toHaveAttribute('data-on', 'true');

    await patientBtn.click();
    await expect(patientBtn).toHaveAttribute('data-on', 'true');

    await expect.poll(async () => (await api<Appt>(token, 'GET', `/appointments/${id}`)).status)
      .toBe('TBC');

    // Manual room override → all three green → auto-confirm to Ok!.
    await roomBtn.click();
    await expect(roomBtn).toHaveAttribute('data-on', 'true');
    await expect(row.getByTestId('confirm-toggles-compact')).toHaveAttribute('data-confirmed', '3');

    await expect.poll(
      async () => (await api<Appt>(token, 'GET', `/appointments/${id}`)).status,
      { message: 'all three confirmations should auto-advance status to Ok!' },
    ).toBe('Ok!');

    const final = await api<Appt>(token, 'GET', `/appointments/${id}`);
    expect(final.doctorConfirmed).toBe(true);
    expect(final.patientConfirmed).toBe(true);

    // Withdraw the doctor confirmation → reverts Ok! → TBC.
    await doctorBtn.click();
    await expect(doctorBtn).toHaveAttribute('data-on', 'false');
    await expect.poll(async () => (await api<Appt>(token, 'GET', `/appointments/${id}`)).status)
      .toBe('TBC');
  } finally {
    // Clean up the throwaway appointment (admin hard-delete needs password + reason).
    await fetch(`${APPT}/appointments/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: PASSWORD, reason: 'e2e confirmation toggle test cleanup' }),
    }).catch(() => { /* best-effort */ });
  }
});
