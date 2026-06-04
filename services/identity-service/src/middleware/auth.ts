import { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, UserRole } from '@fadl/types';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

export function requireRole(...roles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    if (!roles.includes(user.role)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
