import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/**
 * Standard error contract for all services (fable-enhancement §2.7):
 * - ZodError → 400 VALIDATION_ERROR with field detail (never a 500)
 * - 5xx → generic INTERNAL_ERROR + requestId; the real error is only logged
 * - 4xx → pass through code/message + requestId
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const field = first?.path?.join('.') ?? 'input';
      const msg = first?.message ?? 'Validation failed';
      reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `${field}: ${msg}`,
          details: error.flatten().fieldErrors,
          requestId: request.id,
        },
      });
      return;
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled error');
    }

    reply.status(statusCode).send({
      success: false,
      error: statusCode >= 500
        ? { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id }
        : { code, message: (error as Error).message, requestId: request.id },
    });
  });
}
