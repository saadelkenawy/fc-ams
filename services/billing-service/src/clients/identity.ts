const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3000';

export async function verifyUserPassword(authHeader: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${IDENTITY_URL}/auth/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { data?: { valid?: boolean } };
    return data?.data?.valid === true;
  } catch {
    return false;
  }
}
