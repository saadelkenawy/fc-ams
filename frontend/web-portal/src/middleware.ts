import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, importSPKI } from 'jose';

// Pages that are always public
const PUBLIC_PATHS = ['/login', '/api'];

// Route → allowed roles (empty = all authenticated roles)
const ROLE_RULES: Array<{ pattern: RegExp; roles: string[] }> = [
  { pattern: /^\/receptionist(\/|$)/, roles: ['admin', 'receptionist'] },
  { pattern: /^\/doctor(\/|$)/,       roles: ['admin', 'doctor'] },
  { pattern: /^\/register(\/|$)/,     roles: ['admin'] },
  { pattern: /^\/analytics/,          roles: ['admin', 'finance', 'doctor'] },
  { pattern: /^\/reports/,            roles: ['admin', 'finance', 'doctor'] },
  { pattern: /^\/billing/,            roles: ['admin', 'finance', 'receptionist'] },
  { pattern: /^\/sources/,            roles: ['admin', 'finance'] },
  { pattern: /^\/doctors/,            roles: ['admin'] },
  { pattern: /^\/procedures/,         roles: ['admin'] },
  { pattern: /^\/integrations/,       roles: ['admin'] },
  { pattern: /^\/settings/,           roles: ['admin'] },
  { pattern: /^\/procurement/,        roles: ['admin', 'procurement'] },
  { pattern: /^\/encounters/,         roles: ['admin', 'doctor'] },
  { pattern: /^\/chatbot/,            roles: ['admin', 'receptionist'] },
];

// §2.1.4: the portal only ever needs the PUBLIC key — it verifies tokens but
// can no longer mint them, so an XSS or leaked frontend env can't forge auth.
let publicKey: CryptoKey | null = null;
async function getPublicKey(): Promise<CryptoKey | null> {
  if (publicKey) return publicKey;
  const b64 = process.env.JWT_PUBLIC_KEY_B64;
  if (!b64) return null;
  try {
    publicKey = await importSPKI(atob(b64), 'RS256');
    return publicKey;
  } catch {
    return null;
  }
}

async function getRoleFromToken(token: string): Promise<string | null> {
  const key = await getPublicKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'] });
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('fadl_token')?.value;
  const refresh = request.cookies.get('fadl_refresh')?.value;

  // Neither access nor refresh cookie → definitely unauthenticated: redirect
  // server-side so protected shells never flash for logged-out visitors.
  if (!token && !refresh) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Refresh cookie only (access token expired mid-session) → let the client
  // restore the session via /api/auth/refresh.
  if (!token) {
    return NextResponse.next();
  }

  const role = await getRoleFromToken(token);

  // Invalid or tampered token → treat as unauthenticated
  if (!role) {
    return NextResponse.next();
  }

  // Redirect doctors from the clinic-wide patient list to their own patients view
  if (role === 'doctor' && /^\/patients(\/|$)/.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/doctor/patients';
    return NextResponse.redirect(url);
  }

  // Check role-based access
  for (const rule of ROLE_RULES) {
    if (rule.pattern.test(pathname)) {
      if (!rule.roles.includes(role)) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
      break;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/).*)'],
};
