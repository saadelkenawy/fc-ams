import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedCookie } from '../cookies';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3000/api/v1';

/** Logout: revokes the refresh token at identity-service and clears both cookies. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (refreshToken && accessToken) {
    // Best effort — local cookie clearing is the source of truth for the browser
    await fetch(`${IDENTITY_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(ACCESS_COOKIE, '', clearedCookie());
  res.cookies.set(REFRESH_COOKIE, '', clearedCookie());
  return res;
}
