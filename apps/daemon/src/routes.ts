import { handleReadRequest, READ_BASE } from './read-routes';
import type { DaemonReadState } from './read-state';

export type FetchHandler = (request: Request) => Response | Promise<Response>;

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const TEXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' };

export const handleRequest = (request: Request): Response => {
  const path = new URL(request.url).pathname;
  if (path === '/healthz') {
    if (request.method !== 'GET') {
      return new Response(null, { headers: { ...TEXT_HEADERS, allow: 'GET' }, status: 405 });
    }
    return new Response(JSON.stringify({ status: 'ok' }), { headers: JSON_HEADERS, status: 200 });
  }
  return new Response(null, { headers: TEXT_HEADERS, status: 404 });
};

/** Health stays unauthenticated; only the read surface needs the deployment-local token. */
export const createRequestHandler = (state: DaemonReadState, readToken: string): FetchHandler => {
  const read = handleReadRequest(state, readToken);
  return (request: Request): Response => {
    const path = new URL(request.url).pathname;
    if (path === READ_BASE || path.startsWith(`${READ_BASE}/`)) return read(request);
    return handleRequest(request);
  };
};
