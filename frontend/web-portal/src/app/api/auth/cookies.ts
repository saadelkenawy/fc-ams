/** Shared cookie settings for the auth route handlers. */

export const ACCESS_COOKIE = 'fadl_token';
export const REFRESH_COOKIE = 'fadl_refresh';

const isProd = process.env.NODE_ENV === 'production';

interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'strict';
  secure: boolean;
  path: string;
  maxAge: number;
}

/** Access token cookie — read only by middleware.ts for role routing; 15 min like the JWT. */
export function accessCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: isProd, path: '/', maxAge: 900 };
}

/** Refresh token cookie — HttpOnly so XSS cannot exfiltrate the long-lived credential. */
export function refreshCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: isProd, path: '/', maxAge: 7 * 24 * 60 * 60 };
}

export function clearedCookie(): Omit<CookieOptions, 'maxAge'> & { maxAge: number } {
  return { httpOnly: true, sameSite: 'strict', secure: isProd, path: '/', maxAge: 0 };
}
