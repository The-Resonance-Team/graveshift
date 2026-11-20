import type { AuditEntry } from '@graveshift/core';
import type { PolicyContext } from '@graveshift/policy';

export interface IncidentView {
  incident: {
    id: string;
    service: string;
    state: string;
    diagnosis?: { confidence: number } & Record<string, unknown>;
  } & Record<string, unknown>;
  severity?: string;
  category?: string;
  detections?: Array<{ rule: string }>;
  pr?: { url: string; number: number; branch: string };
  timeline?: Array<{ at: string; type: string; detail: string }>;
}

/** Everything the server reads. The daemon HTTP API implements it; tests inject fakes. */
export interface Backend {
  listServices(): Promise<unknown[]>;
  listIncidents(): Promise<IncidentView[]>;
  getIncident(id: string): Promise<IncidentView | undefined>;
  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<unknown>;
  tailLogs?(service: string, lines: number): Promise<string[]>;
  queryMetric?(promql: string): Promise<number | null>;
  /** ponytail: counters default to zero because the daemon exposes none, upgrade when it serves them */
  counters?(): PolicyContext['counters'];
}

export function createDaemonBackend(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  metrics?: { query(promql: string): Promise<number | null> },
): Backend {
  const get = async (path: string): Promise<Response> => {
    const res = await fetchFn(new URL(path, baseUrl), { signal: AbortSignal.timeout(5000) });
    if (!res.ok && res.status !== 404) throw new Error(`daemon responded ${res.status}`);
    return res;
  };
  const read = async <T>(path: string): Promise<T> => (await get(path)).json() as Promise<T>;
  return {
    listServices: () => read('/api/graveyard'),
    listIncidents: () => read('/api/incidents'),
    async getIncident(id) {
      const res = await get(`/api/incidents/${encodeURIComponent(id)}`);
      return res.status === 404 ? undefined : ((await res.json()) as IncidentView);
    },
    listAudit: ({ afterSeq, limit }) => read(`/api/audit?afterSeq=${afterSeq}&limit=${limit}`),
    verifyChain: () => read('/api/audit/verify'),
    ...(metrics ? { queryMetric: (q: string) => metrics.query(q) } : {}),
  };
}
