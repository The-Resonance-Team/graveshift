import axios from 'axios';

// Same-origin: next.config.ts rewrites /api/* to the daemon, so no CORS and no credentials in the browser.
export const api = axios.create({ baseURL: '/', timeout: 10_000 });

api.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const method = error.config?.method?.toUpperCase() ?? 'GET';
    const status = error.response?.status ?? 'network';
    const wrapped = new Error(`${method} ${error.config?.url ?? ''} → ${status}`, { cause: error });
    return Promise.reject(wrapped);
  }
  return Promise.reject(error instanceof Error ? error : new Error('request failed'));
});
