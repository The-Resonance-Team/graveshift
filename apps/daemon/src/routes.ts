export type FetchHandler = (request: Request) => Response | Promise<Response>;

const JSON_HEADERS = { 'content-type': 'application/json' };

export const handleRequest = (request: Request): Response => {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/healthz') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: JSON_HEADERS,
      status: 200,
    });
  }
  return new Response(null, { status: 404 });
};
