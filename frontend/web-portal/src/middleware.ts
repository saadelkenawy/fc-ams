import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const role = request.cookies.get('fadl_role')?.value;

  // No role cookie → redirect to login (cookie set on login, missing = not logged in)
  if (!role) {
    // Allow through — the client layout already handles the redirect via useAuth
    // We can't reliably detect if it's a fresh page load vs cookie expiry here
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
