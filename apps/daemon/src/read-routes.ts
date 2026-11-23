import { bearerMatches } from './private-http';
import type { DaemonReadState } from './read-state';

export const READ_BASE = '/read';

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const TEXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status });

const error = (status: number, code: string): Response => json({ error: code }, status);

const param = (url: URL, name: string): string | undefined =>
  url.searchParams.get(name) ?? undefined;

const numberParam = (url: URL, name: string, fallback: number): number | undefined => {
  const raw = param(url, name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return undefined;
  return Number(raw);
};

/** Read-only HTTP surface. Health stays on the plain handler and needs no token. */
export const handleReadRequest =
  (state: DaemonReadState, token: string) =>
  (request: Request): Response => {
    const url = new URL(request.url);
    if (!bearerMatches(request, token)) return error(401, 'unauthorized');
    if (request.method !== 'GET') {
      return new Response(null, { headers: { ...TEXT_HEADERS, allow: 'GET' }, status: 405 });
    }

    const path = url.pathname;
    if (path === `${READ_BASE}/services`) return json(state.listServices());
    if (path === `${READ_BASE}/incidents`) return json(state.listIncidents());
    if (path.startsWith(`${READ_BASE}/incidents/`)) {
      let id: string;
      try {
        id = decodeURIComponent(path.slice(`${READ_BASE}/incidents/`.length));
      } catch {
        return error(400, 'invalid_id');
      }
      const view = state.getIncident(id);
      return view === undefined ? error(404, 'not_found') : json(view);
    }
    if (path === `${READ_BASE}/audit/verify`) return json(state.verifyChain());
    if (path === `${READ_BASE}/audit`) {
      const afterSeq = numberParam(url, 'afterSeq', 0);
      const limit = numberParam(url, 'limit', 50);
      if (afterSeq === undefined || limit === undefined || limit < 1) {
        return error(400, 'invalid_query');
      }
      return json(state.listAudit(afterSeq, Math.min(limit, 100)));
    }
    if (path === `${READ_BASE}/logs`) {
      const service = param(url, 'service');
      const lines = numberParam(url, 'lines', 50);
      if (service === undefined || service.length === 0 || lines === undefined || lines < 1) {
        return error(400, 'invalid_query');
      }
      return json(state.tailLogs(service, Math.min(lines, 200)));
    }
    if (path === `${READ_BASE}/metrics`) {
      const promql = param(url, 'promql');
      if (promql === undefined || promql.length === 0) return error(400, 'invalid_query');
      return json({ value: state.queryMetric(promql) });
    }
    if (path === `${READ_BASE}/counters`) return json(state.counters());
    return error(404, 'unknown_route');
  };
