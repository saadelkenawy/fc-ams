import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from '../cookies';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3000/api/v1';

/**
 * Login proxy: forwards credentials to identity-service and moves the tokens
 * into HttpOnly cookies so they are never exposed to page JavaScript.
 * The access token is also returned in the body for in-memory use by the
 * axios clients (it expires in 15 min; the refresh token never reaches JS).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();

  const upstream = await fetch(`${IDENTITY_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    body,
    cache: 'no-store',
  });

  const payload = await upstream.json().catch(() => null) as
    | { success?: boolean; data?: { accessToken: string; refreshToken: string; expiresIn: number; user: unknown } }
    | null;

  if (!upstream.ok || !payload?.data) {
    return NextResponse.json(payload ?? { success: false, error: { code: 'LOGIN_FAILED', message: 'Login failed' } }, { status: upstream.status || 502 });
  }

  const { accessToken, refreshToken, expiresIn, user } = payload.data;

  const res = NextResponse.json({ success: true, data: { accessToken, expiresIn, user } });
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return res;
}
