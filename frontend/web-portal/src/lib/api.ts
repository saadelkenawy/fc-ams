import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/** Extend InternalAxiosRequestConfig to carry the retry flag. */
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

function addAuthRequest(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('fadl_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}

function redirectToLogin(): void {
  localStorage.removeItem('fadl_token');
  localStorage.removeItem('fadl_refresh_token');
  localStorage.removeItem('fadl_user');
  window.location.href = '/login';
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

interface RefreshResponse {
  data: {
    accessToken: string;
    refreshToken: string;
  };
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

      const refreshToken = localStorage.getItem('fadl_refresh_token');
      if (!refreshToken) {
        redirectToLogin();
        return Promise.reject(err);
      }

      config._retry = true;

      try {
        const { data } = await axios.post<RefreshResponse>(
          `/api/proxy/identity/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        );
        const { accessToken, refreshToken: newRefresh } = data.data;
        localStorage.setItem('fadl_token', accessToken);
        localStorage.setItem('fadl_refresh_token', newRefresh);
        config.headers.Authorization = `Bearer ${accessToken}`;
        return client(config);
      } catch {
        redirectToLogin();
        return Promise.reject(err);
      }
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
