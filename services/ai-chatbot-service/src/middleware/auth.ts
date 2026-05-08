import { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '@fadl/types';

declare module '@fastify/jwt' {
  interface FastifyJWT { user: JwtPayload }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    void reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
  }
}
