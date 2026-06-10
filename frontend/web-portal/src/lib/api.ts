import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/** Extend InternalAxiosRequestConfig to carry the retry flag. */
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// ─── In-memory access token ────────────────────────────────────────────────
// The access token lives only in memory (and in an HttpOnly cookie used by
// middleware.ts). The refresh token is an HttpOnly cookie managed entirely by
// the /api/auth/* route handlers — page JavaScript never sees it, so XSS
// cannot exfiltrate a long-lived credential.

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// One-time cleanup of the legacy localStorage token slots (pre-cookie auth)
if (typeof window !== 'undefined') {
  localStorage.removeItem('fadl_token');
  localStorage.removeItem('fadl_refresh_token');
}

function addAuthRequest(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    return config;
  });
}

function redirectToLogin(): void {
  accessToken = null;
  localStorage.removeItem('fadl_user');
  window.location.href = '/login';
}

// ─── Single-flight silent refresh ──────────────────────────────────────────
// When several queries 401 at once, only ONE refresh request is sent; all
// callers await the same promise. This avoids refresh-token rotation races
// that previously could log users out at random.

let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= axios
    .post<{ data: { accessToken: string } }>(
      '/api/auth/refresh',
      {},
      { headers: { 'Content-Type': 'application/json' } },
    )
    .then((res) => {
      accessToken = res.data.data.accessToken;
      return accessToken;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Simple redirect-on-401 — used by identityApi to avoid refresh loops. */
function addSimple401Handler(client: AxiosInstance): void {
  client.interceptors.response.use(
    (res) => res,
    (err: { response?: { status?: number } }) => {
      if (err.response?.status === 401 && typeof window !== 'undefined') {
        redirectToLogin();
      }
      return Promise.reject(err);
    },
  );
}

/** Silent-refresh-on-401 — used by all non-identity clients. */
function addRefresh401Handler(client: AxiosInstance): void {
  client.interceptors.response.use(
    (res) => res,
    async (err: { config?: RetryableConfig; response?: { status?: number } }) => {
      const config = err.config;

      if (err.response?.status !== 401 || !config || config._retry) {
        return Promise.reject(err);
      }

      if (typeof window === 'undefined') return Promise.reject(err);

      config._retry = true;

      const token = await refreshAccessToken();
      if (!token) {
        redirectToLogin();
        return Promise.reject(err);
      }

      config.headers.Authorization = `Bearer ${token}`;
      return client(config);
    },
  );
}

function makeClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  });
  addAuthRequest(client);
  return client;
}

function makeIdentityClient(baseURL: string): AxiosInstance {
  const client = makeClient(baseURL);
  addSimple401Handler(client);
  return client;
}

function makeServiceClient(baseURL: string): AxiosInstance {
  const client = makeClient(baseURL);
  addRefresh401Handler(client);
  return client;
}

// All requests go through Next.js rewrites → Docker internal network
export const identityApi     = makeIdentityClient('/api/proxy/identity');
export const patientApi      = makeServiceClient('/api/proxy/patients');
export const appointmentApi  = makeServiceClient('/api/proxy/appointments');
export const doctorApi       = makeServiceClient('/api/proxy/doctors');
export const billingApi      = makeServiceClient('/api/proxy/billing');
export const ehrApi          = makeServiceClient('/api/proxy/ehr');
export const procedureApi    = makeServiceClient('/api/proxy/procedures');
export const notificationApi = makeServiceClient('/api/proxy/notifications');
export const analyticsApi    = makeServiceClient('/api/proxy/analytics');
export const chatbotApi      = makeServiceClient('/api/proxy/chatbot');
export const fileApi         = makeServiceClient('/api/proxy/files');
export const integrationApi  = makeServiceClient('/api/proxy/integration');
export const procurementApi  = makeServiceClient('/api/proxy/procurement');
