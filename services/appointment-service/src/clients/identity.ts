import axios from 'axios';
import { config } from '../config';

const identityClient = axios.create({
  baseURL: config.IDENTITY_SERVICE_URL ?? 'http://identity-service:3000',
  timeout: 5_000,
  headers: { 'Content-Type': 'application/json' },
});

export async function verifyUserPassword(authHeader: string, password: string): Promise<boolean> {
  try {
    const res = await identityClient.post<{ success: boolean; data: { valid: boolean } }>(
      '/auth/verify-password',
      { password },
      { headers: { Authorization: authHeader } },
    );
    return res.data?.data?.valid === true;
  } catch {
    return false;
  }
}
