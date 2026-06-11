import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '@fadl/types';
// Type-side import: applies @fastify/jwt's augmentation of FastifyRequest
// (request.user, request.jwtVerify) for this module and for consumers.
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload;
  }
}

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface RequireAuthOptions {
  serviceName: string;
  /** Dedicated HS256 secret for service-to-service tokens (SERVICE_JWT_SECRET). */
  serviceTokenSecret: string;
}

/**
 * Verify an HS256 service token by hand. Services register @fastify/jwt with
 * only the RS256 public key, so service tokens live in their own trust
 * domain: knowing SERVICE_JWT_SECRET lets a caller reach other services'
 * internal endpoints but can never forge a user access token.
 */
function verifyServiceToken(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as JwtPayload & { exp?: number };
    if (payload.tokenType !== 'service') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function unauthorized(reply: FastifyReply, message: string): void {
  reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message } });
}

/**
 * Build the JWT auth preHandler for a service (§2.1.4 asymmetric design):
 * - user access tokens are RS256, signed only by identity-service and
 *   verified via the app's @fastify/jwt registration (public key, alg pinned)
 * - service tokens are HS256 against SERVICE_JWT_SECRET with a target-scoped
 *   `aud`: a token minted for billing-service is rejected by doctor-service.
 * The algorithm is taken from the token header, and each path verifies
 * against exactly one key type, so neither token kind can masquerade as
 * the other.
 */
export function createRequireAuth(opts: RequireAuthOptions): PreHandler {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = request.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) {
      unauthorized(reply, 'Authentication required');
      return;
    }

    let alg: string | undefined;
    try {
      alg = (JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as { alg?: string }).alg;
    } catch {
      unauthorized(reply, 'Authentication required');
      return;
    }

    if (alg === 'HS256') {
      const payload = verifyServiceToken(token, opts.serviceTokenSecret);
      if (!payload) {
        unauthorized(reply, 'Authentication required');
        return;
      }
      if (payload.aud !== opts.serviceName) {
        unauthorized(reply, 'Token not valid for this service');
        return;
      }
      request.user = payload;
      return;
    }

    try {
      await request.jwtVerify();
      // RS256 path is user tokens only — a service claim here means a token
      // signed with the identity private key pretending to be internal.
      if ((request.user as JwtPayload).tokenType === 'service') {
        unauthorized(reply, 'Token not valid for this service');
      }
    } catch {
      unauthorized(reply, 'Authentication required');
    }
  };
}

export function requireRole(...roles: JwtPayload['role'][]): PreHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as JwtPayload;
    if (!roles.includes(user.role)) {
      reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }
  };
}
