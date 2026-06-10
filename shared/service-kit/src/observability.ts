import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { FastifyInstance } from 'fastify';
import promClient from 'prom-client';

export { promClient };

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/** Request id of the request currently being handled (undefined outside one). */
export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

// Accept only sane ids from callers so a malicious header can't inject log noise.
const REQUEST_ID_RE = /^[\w.-]{1,128}$/;

/**
 * Pass as Fastify's `genReqId` option: reuses an inbound `x-request-id`
 * (so ids correlate across the appointment→doctor→billing call chain)
 * or generates a fresh UUID at the edge.
 */
export function genReqId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const inbound = req.headers['x-request-id'];
  return typeof inbound === 'string' && REQUEST_ID_RE.test(inbound) ? inbound : randomUUID();
}

const registries = new Map<string, promClient.Registry>();

/**
 * Per-service metrics registry (memoized — safe to call from app setup and
 * background workers alike). Carries default process metrics and a
 * `service` label on everything.
 */
export function metricsRegistry(serviceName: string): promClient.Registry {
  let registry = registries.get(serviceName);
  if (!registry) {
    registry = new promClient.Registry();
    registry.setDefaultLabels({ service: serviceName });
    promClient.collectDefaultMetrics({ register: registry });
    registries.set(serviceName, registry);
    return registry;
  }
  return registry;
}

export interface ObservabilityOptions {
  serviceName: string;
  /** Set false to skip /metrics (default true). */
  metrics?: boolean;
}

/**
 * §4.4 observability baseline:
 * - binds the request id into AsyncLocalStorage so createServiceClient can
 *   forward it, and echoes it back as an `x-request-id` response header
 * - exposes GET /metrics (prom-client) with an http request-duration
 *   histogram labelled by method/route/status_code
 *
 * Call after `Fastify({ genReqId, ... })` and before route registration.
 */
export function registerObservability(app: FastifyInstance, opts: ObservabilityOptions): void {
  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', String(request.id));
    requestContext.run({ requestId: String(request.id) }, done);
  });

  if (opts.metrics === false) return;

  const registry = metricsRegistry(opts.serviceName);
  const histogram =
    (registry.getSingleMetric('http_request_duration_seconds') as promClient.Histogram | undefined) ??
    new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 8],
      registers: [registry],
    });

  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    if (route !== '/metrics' && route !== '/health') {
      histogram.observe(
        { method: request.method, route, status_code: String(reply.statusCode) },
        reply.elapsedTime / 1000,
      );
    }
    done();
  });

  app.get('/metrics', { logLevel: 'silent' }, async (_request, reply) => {
    void reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
