import { makeServiceToken as mintToken } from '@fadl/service-kit';
import { config } from '../config';

interface ApptRow { startTime: string; status: string }

/**
 * Booked start times (HH:MM) for a doctor on a date — sourced from
 * appointment-service (appointments live in fadl_appointments, not in this
 * service's database). Fail-open: on any error availability falls back to
 * "no slots booked" rather than failing the whole availability lookup.
 */
export async function getBookedStartTimes(doctorId: string, date: string): Promise<Set<string>> {
  try {
    const token = mintToken('appointment-service', {
      serviceTokenSecret: config.SERVICE_JWT_SECRET,
      branchId: config.BRANCH_ID,
    });
    const url = `${config.APPOINTMENT_SERVICE_URL}/appointments?doctorId=${doctorId}&date=${date}&limit=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`appointment-service responded ${res.status}`);
    const body = (await res.json()) as { data: ApptRow[] };
    return new Set(
      body.data
        .filter((a) => !['Canc.', 'Resch.'].includes(a.status))
        .map((a) => a.startTime.slice(0, 5)),
    );
  } catch (err) {
    console.warn('[doctor] booked-slots lookup skipped:', (err as Error).message);
    return new Set();
  }
}
