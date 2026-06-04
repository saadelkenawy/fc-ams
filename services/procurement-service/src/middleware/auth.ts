import { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '@fadl/types';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }
}

export function requireRole(...roles: JwtPayload['role'][]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.user.role)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
