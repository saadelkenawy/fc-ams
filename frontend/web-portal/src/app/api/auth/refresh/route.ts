import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions, clearedCookie } from '../cookies';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3000/api/v1';

/**
 * Silent session refresh: exchanges the HttpOnly refresh cookie for a new
 * access token (identity-service rotates the refresh token). Returns the new
 * access token in the body for in-memory use.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  const upstream = await fetch(`${IDENTITY_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  const payload = await upstream.json().catch(() => null) as
    | { success?: boolean; data?: { accessToken: string; refreshToken: string; expiresIn: number } }
    | null;

  if (!upstream.ok || !payload?.data) {
    // Refresh token invalid/expired — clear both cookies so middleware redirects to login
    const res = NextResponse.json(
      payload ?? { success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Session expired' } },
      { status: upstream.status || 401 },
    );
    res.cookies.set(ACCESS_COOKIE, '', clearedCookie());
    res.cookies.set(REFRESH_COOKIE, '', clearedCookie());
    return res;
  }

  const { accessToken, refreshToken: newRefresh, expiresIn } = payload.data;
  const res = NextResponse.json({ success: true, data: { accessToken, expiresIn } });
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, newRefresh, refreshCookieOptions());
  return res;
}
