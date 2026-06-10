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

/**
 * Build the JWT auth preHandler for a service. Verifies the HS256 signature
 * and, for service-to-service tokens, enforces the target-scoped `aud` claim:
 * a token minted for billing-service must not be accepted by doctor-service.
 */
export function createRequireAuth(serviceName: string): PreHandler {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify();
      const payload = request.user as JwtPayload;
      if (payload.tokenType === 'service' && payload.aud !== serviceName) {
        reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Token not valid for this service' },
        });
        return;
      }
    } catch {
      reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
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
