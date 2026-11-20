import type { RuntimeSource, ServiceHealth } from '@graveshift/core';
import type { Mode } from '@graveshift/policy';
import type { AuditStore } from '@graveshift/store';

import type { DaemonEvent, Registry } from './registry';

export const SCENARIOS = [
  'null-candy',
  'memory-leech',
  'wrong-potion',
  'slow-curse',
  'image-ghost',
] as const;
const WORKER_SCENARIOS = new Set(['memory-leech']);

export interface HttpDeps {
  registry: Registry;
  audit: AuditStore;
  source: RuntimeSource;
  mode: { policy: Mode; effective: Mode; warning?: string };
  haunt?: { apiUrl: string; workerUrl: string; token: string; minIntervalMs?: number };
  fetch?: typeof fetch;
  now?: () => number;
  heartbeatMs?: number;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export function createHttp(deps: HttpDeps) {
  const { registry, audit, source, mode } = deps;
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetch ?? fetch;
  let lastHaunt = -Infinity;

  async function graveyard() {
    const services = await source.listServices();
    const open = registry
      .list()
      .filter((v) => !['resolved', 'dismissed'].includes(v.incident.state));
    return Promise.all(
      services.map(async (service) => {
        const health: ServiceHealth | undefined = await source
          .getHealth(service.name)
          .catch(() => undefined);
        const incident = open.find((v) => v.incident.service === service.name);
        return {
          ...service,
          health: health?.status ?? 'unknown',
          ...(incident
            ? {
                incidentId: incident.incident.id,
                severity: incident.severity,
                state: incident.incident.state,
              }
            : {}),
        };
      }),
    );
  }

  function events(signal: AbortSignal): Response {
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            cleanup();
          }
        };
        send('hello', { mode: mode.effective, incidents: registry.list().length });
        const unsubscribe = registry.subscribe((event: DaemonEvent) => send(event.type, event));
        const heartbeat = setInterval(
          () => send('ping', { at: new Date(now()).toISOString() }),
          deps.heartbeatMs ?? 15_000,
        );
        cleanup = () => {
          unsubscribe();
          clearInterval(heartbeat);
        };
        signal.addEventListener('abort', () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel: () => cleanup(),
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      },
    });
  }

  async function haunt(req: Request): Promise<Response> {
    if (!deps.haunt?.token) return json({ error: 'haunt is not configured' }, 404);
    const body: unknown = await req.json().catch(() => null);
    const scenario =
      typeof body === 'object' && body !== null
        ? (body as { scenario?: unknown }).scenario
        : undefined;
    if (typeof scenario !== 'string' || !SCENARIOS.some((s) => s === scenario))
      return json({ error: 'unknown scenario' }, 400);
    // demo-only guard: one haunt per interval for the whole daemon
    const minInterval = deps.haunt.minIntervalMs ?? 30_000;
    if (now() - lastHaunt < minInterval) {
      const retry = Math.ceil((minInterval - (now() - lastHaunt)) / 1000);
      return Response.json(
        { error: 'rate limited' },
        { status: 429, headers: { 'retry-after': String(retry) } },
      );
    }
    lastHaunt = now();
    const target = WORKER_SCENARIOS.has(scenario) ? deps.haunt.workerUrl : deps.haunt.apiUrl;
    const res = await fetchFn(new URL('/__haunt', target), {
      method: 'POST',
      headers: { 'x-haunt-token': deps.haunt.token, 'content-type': 'application/json' },
      body: JSON.stringify({ scenario }),
    }).catch(() => undefined);
    if (!res) return json({ error: 'demo app unreachable' }, 502);
    await audit.append({
      actor: 'daemon',
      type: 'demo.haunt',
      payload: { scenario, status: res.status },
    });
    return json({ scenario, status: res.status }, res.ok ? 202 : 502);
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === 'GET' && path === '/healthz') return json({ status: 'ok' });
    if (req.method === 'GET' && path === '/api/mode') return json(mode);
    if (req.method === 'GET' && path === '/api/graveyard') return json(await graveyard());
    if (req.method === 'GET' && path === '/api/incidents') return json(registry.list());
    if (req.method === 'GET' && path === '/api/events') return events(req.signal);
    if (req.method === 'GET' && path === '/api/audit') {
      const afterSeq = Number(url.searchParams.get('afterSeq') ?? 0) || 0;
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 100);
      return json(await audit.list({ afterSeq, limit }));
    }
    if (req.method === 'GET' && path === '/api/audit/verify')
      return json(await audit.verifyChain());
    if (req.method === 'POST' && path === '/api/haunt') return haunt(req);
    const match = /^\/api\/incidents\/([^/]+)(\/timeline|\/pr)?$/.exec(path);
    if (req.method === 'GET' && match) {
      const view = registry.get(decodeURIComponent(match[1] ?? ''));
      if (!view) return json({ error: 'not found' }, 404);
      if (match[2] === '/timeline') return json(view.timeline);
      if (match[2] === '/pr') return json(view.pr ?? null);
      return json(view);
    }
    return json({ error: 'not found' }, 404);
  };
}
