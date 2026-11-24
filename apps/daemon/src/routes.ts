export type FetchHandler = (request: Request) => Response | Promise<Response>;

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const TEXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' };

/** Health stays unauthenticated and carries no daemon data. */
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

/**
 * The daemon serves only two private surfaces and health. Commands and reads
 * both authenticate with the ADR 0020 daemon internal token in their handlers.
 */
export function daemonHandler(commands: FetchHandler, reads: FetchHandler): FetchHandler {
  return (request) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/internal/work/')) return commands(request);
    if (path.startsWith('/internal/read/')) return reads(request);
    return handleRequest(request);
  };
}
