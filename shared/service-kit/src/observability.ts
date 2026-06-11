import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { FastifyInstance } from 'fastify';
import promClient from 'prom-client';

export { promClient };

interface RequestStore {
  requestId: string;
  /** Branch of the authenticated caller (§3.1) — set by requireAuth from the verified JWT. */
  branchId?: number;
}

const requestContext = new AsyncLocalStorage<RequestStore>();

/** Request id of the request currently being handled (undefined outside one). */
export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/** Branch of the authenticated request being handled (undefined outside one / before auth). */
export function currentBranchId(): number | undefined {
  return requestContext.getStore()?.branchId;
}

/** Called by requireAuth once the JWT is verified — binds the caller's branch to this request. */
export function setRequestBranchId(branchId: number | null | undefined): void {
  const store = requestContext.getStore();
  if (store && typeof branchId === 'number') store.branchId = branchId;
}

/**
 * Run `fn` inside a synthetic request context — for background workers and
 * tests that need a specific RLS branch without an HTTP request.
 */
export function withRequestContext<T>(ctx: { requestId?: string; branchId?: number }, fn: () => T): T {
  return requestContext.run({ requestId: ctx.requestId ?? randomUUID(), branchId: ctx.branchId }, fn);
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
    const store: RequestStore = { requestId: String(request.id) };
    requestContext.run(store, done);
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

/** Decode a base64-encoded PEM env var (JWT_PUBLIC_KEY_B64 / JWT_PRIVATE_KEY_B64). */
export function pemFromBase64(b64: string): string {
  const pem = Buffer.from(b64, 'base64').toString('utf8');
  if (!pem.includes('-----BEGIN')) {
    throw new Error('Decoded value is not a PEM key — check the *_B64 env var');
  }
  return pem;
}
