import { createHmac } from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { currentRequestId } from './observability';

export interface ServiceTokenOptions {
  /**
   * Dedicated HS256 secret for service-to-service tokens
   * (config.SERVICE_JWT_SECRET) — deliberately NOT the user-token key
   * material, so holding it cannot forge user access tokens (§2.1.4).
   */
  serviceTokenSecret: string;
  /** Branch the calling service operates in (config.BRANCH_ID). */
  branchId: number;
  /** Synthetic caller identity for audit logs; defaults to the shared service UUID. */
  sub?: string;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Mint a short-lived service-to-service JWT scoped to one target service.
 * 120 s TTL, minted fresh per request — never cache or persist these.
 */
export function makeServiceToken(aud: string, opts: ServiceTokenOptions): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: opts.sub ?? '00000000-0000-0000-0000-000000000001', role: 'admin',
    tokenType: 'service', aud,
    branchId: opts.branchId, doctorId: null,
    iat: now, exp: now + 120,
  }));
  const sig = createHmac('sha256', opts.serviceTokenSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export interface ServiceClientOptions extends ServiceTokenOptions {
  baseURL: string;
  /** `aud` claim = target's SERVICE_NAME, e.g. 'billing-service'. */
  aud: string;
  timeoutMs?: number;
}

/**
 * Axios instance for service-to-service calls: 8 s timeout and a fresh
 * target-scoped service token minted on every request.
 */
export function createServiceClient(opts: ServiceClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: opts.baseURL,
    timeout: opts.timeoutMs ?? 8_000,
    headers: { 'Content-Type': 'application/json' },
  });
  client.interceptors.request.use((cfg) => {
    cfg.headers.Authorization = `Bearer ${makeServiceToken(opts.aud, opts)}`;
    const requestId = currentRequestId();
    if (requestId) cfg.headers['x-request-id'] = requestId;
    return cfg;
  });
  return client;
}
