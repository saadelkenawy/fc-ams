import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { TIER_MODULES } from '@fadl/types';
import type { ModuleId, SubscriptionTier } from '@fadl/types';

// Pages that are always public
const PUBLIC_PATHS = ['/login', '/api', '/module-unavailable'];

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

// Route → module ID (more specific routes first)
const ROUTE_MODULE_MAP: Array<{ pattern: RegExp; moduleId: ModuleId }> = [
  { pattern: /^\/billing\/settlements(\/|$)/, moduleId: 'settlements' },
  { pattern: /^\/billing(\/|$)/,              moduleId: 'billing' },
  { pattern: /^\/appointments(\/|$)/,         moduleId: 'scheduling' },
  { pattern: /^\/patients(\/|$)/,             moduleId: 'patients' },
  { pattern: /^\/encounters(\/|$)/,           moduleId: 'ehr' },
  { pattern: /^\/prescriptions(\/|$)/,        moduleId: 'ehr' },
  { pattern: /^\/analytics(\/|$)/,            moduleId: 'analytics' },
  { pattern: /^\/procurement(\/|$)/,          moduleId: 'procurement' },
  { pattern: /^\/chatbot(\/|$)/,              moduleId: 'ai' },
  { pattern: /^\/integrations(\/|$)/,         moduleId: 'integrations' },
];

const VALID_TIERS = new Set<string>(['basic', 'standard', 'premium']);

async function getClaimsFromToken(token: string): Promise<{ role: string | null; tier: SubscriptionTier | null }> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return { role: null, tier: null };
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = typeof payload.role === 'string' ? payload.role : null;
    const tier = typeof payload.subscriptionTier === 'string' && VALID_TIERS.has(payload.subscriptionTier)
      ? payload.subscriptionTier as SubscriptionTier
      : null;
    return { role, tier };
  } catch {
    return { role: null, tier: null };
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('fadl_token')?.value;

  // No token cookie → let client layout handle the redirect via useAuth
  if (!token) {
    return NextResponse.next();
  }

  const { role, tier } = await getClaimsFromToken(token);

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

  // Check module-level access based on subscription tier.
  // Fall back to 'premium' for tokens issued before the subscriptionTier claim
  // was introduced — gives existing sessions a one-rotation grace period.
  const effectiveTier: SubscriptionTier = tier ?? 'premium';
  const enabledModules = TIER_MODULES[effectiveTier];
  for (const { pattern, moduleId } of ROUTE_MODULE_MAP) {
    if (pattern.test(pathname) && !enabledModules.includes(moduleId)) {
      const url = request.nextUrl.clone();
      url.pathname = '/module-unavailable';
      url.searchParams.set('module', moduleId);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/).*)'],
};
