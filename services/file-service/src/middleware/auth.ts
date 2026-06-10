import { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '@fadl/types';
import { config } from '../config';

declare module '@fastify/jwt' { interface FastifyJWT { user: JwtPayload } }

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    // Service tokens are scoped to one target service via the aud claim
    const _p = request.user as JwtPayload;
    if (_p.tokenType === 'service' && _p.aud !== config.SERVICE_NAME) {
      reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token not valid for this service' } });
      return;
    }
  }
  catch { reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } }); }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as JwtPayload;
    if (!roles.includes(user.role)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    }
  };
}
