export { createRequireAuth, requireRole } from './auth';
export type { RequireAuthOptions } from './auth';
export { makeServiceToken, createServiceClient } from './service-token';
export type { ServiceTokenOptions, ServiceClientOptions } from './service-token';
export { createDb } from './db';
export type { Db, DbOptions } from './db';
export { registerErrorHandler } from './error-handler';
export { createRateLimitStore } from './rate-limit-redis';
export type { RateLimitStoreOptions } from './rate-limit-redis';
export {
  genReqId,
  currentRequestId,
  currentBranchId,
  setRequestBranchId,
  withRequestContext,
  registerObservability,
  metricsRegistry,
  promClient,
  pemFromBase64,
} from './observability';
export type { ObservabilityOptions } from './observability';
