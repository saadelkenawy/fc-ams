import { createServiceClient } from '@fadl/service-kit';
import { config } from '../config';

const doctorClient = createServiceClient({
  baseURL: config.DOCTOR_SERVICE_URL,
  aud: 'doctor-service',
  serviceTokenSecret: config.SERVICE_JWT_SECRET,
  branchId: config.BRANCH_ID,
});

export interface DoctorDayAvailability {
  doctorId: string;
  date: string;
  hasSchedule?: boolean;
  isWorking: boolean;
  slots: Array<{ time: string; available: boolean }>;
  totalSlots: number;
  bookedSlots: number;
  maxPatients: number;
}

/**
 * Doctor working-hours lookup used to validate appointment creation.
 * Fail-open: a cross-service outage must never block booking — callers get
 * null and skip the validation.
 */
export async function getDoctorAvailability(
  doctorId: string,
  date: string,
): Promise<DoctorDayAvailability | null> {
  try {
    const res = await doctorClient.get<{ data: DoctorDayAvailability }>(
      `/doctors/${doctorId}/availability`,
      { params: { date } },
    );
    return res.data.data;
  } catch (err) {
    console.warn('[appt] doctor availability check skipped:', (err as Error).message);
    return null;
  }
}
