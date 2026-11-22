import { createHash } from 'node:crypto';

export interface LimitCounters {
  openPrsLastHour: number;
  actionsLast10Min: number;
  diagnosisLoops: number;
  llmSpentTodayUsd: number;
}

export interface ServiceView {
  name: string;
  status: string;
}

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
  timeline?: Array<{ at: string; type: string; detail: string }>;
}

export interface AuditEntryView {
  seq: number;
  at: string;
  actor: string;
  type: string;
  incidentId?: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface ChainResult {
  ok: boolean;
  length: number;
  reason?: string;
}

export interface DaemonReadState {
  listServices(): ServiceView[];
  listIncidents(): IncidentView[];
  getIncident(id: string): IncidentView | undefined;
  listAudit(afterSeq: number, limit: number): AuditEntryView[];
  verifyChain(): ChainResult;
  tailLogs(service: string, lines: number): string[];
  queryMetric(promql: string): number | null;
  counters(): LimitCounters;
  recordIncident(view: IncidentView): void;
  appendAudit(entry: AuditInput): void;
  appendLog(service: string, line: string): void;
  setMetric(promql: string, value: number): void;
  setCounters(counters: LimitCounters): void;
}

type AuditInput = Omit<AuditEntryView, 'prevHash' | 'hash'>;

const GENESIS = '0'.repeat(64);
const MAX_ENTRIES = 200;

const hashEntry = (entry: AuditInput, prevHash: string): string =>
  createHash('sha256')
    .update(`${prevHash}|${JSON.stringify(entry)}`)
    .digest('hex');

const bound = <T>(map: Map<string, T>, key: string, value: T): void => {
  if (map.size >= MAX_ENTRIES && !map.has(key)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
};

/** The daemon's own in-memory state. Writes are for daemon internals; the HTTP routes only read. */
export const createReadState = (): DaemonReadState => {
  const incidents: IncidentView[] = [];
  const audit: AuditEntryView[] = [];
  const logs = new Map<string, string[]>();
  const metrics = new Map<string, number>();
  let limits: LimitCounters = {
    openPrsLastHour: 0,
    actionsLast10Min: 0,
    diagnosisLoops: 0,
    llmSpentTodayUsd: 0,
  };

  return {
    listServices: () => {
      const names = new Set<string>();
      for (const view of incidents) names.add(view.incident.service);
      for (const name of logs.keys()) names.add(name);
      return [...names].map((name) => {
        const open = incidents.find(
          (view) => view.incident.service === name && view.incident.state !== 'resolved',
        );
        return { name, status: open?.incident.state ?? 'healthy' };
      });
    },
    listIncidents: () => incidents,
    getIncident: (id) => incidents.find((view) => view.incident.id === id),
    listAudit: (afterSeq, limit) => audit.filter((entry) => entry.seq > afterSeq).slice(0, limit),
    verifyChain: () => {
      let previous = GENESIS;
      for (const entry of audit) {
        const { seq, at, actor, type, payload, incidentId } = entry;
        const input: AuditInput = {
          seq,
          at,
          actor,
          type,
          payload,
          ...(incidentId === undefined ? {} : { incidentId }),
        };
        const expected = hashEntry(input, previous);
        if (entry.prevHash !== previous || entry.hash !== expected) {
          return { ok: false, length: audit.length, reason: 'hash_mismatch' };
        }
        previous = entry.hash;
      }
      return { ok: true, length: audit.length };
    },
    tailLogs: (service, lines) => (logs.get(service) ?? []).slice(-lines),
    queryMetric: (promql) => metrics.get(promql) ?? null,
    counters: () => limits,
    recordIncident: (view) => {
      const index = incidents.findIndex((item) => item.incident.id === view.incident.id);
      if (index === -1) incidents.unshift(view);
      else incidents[index] = view;
      if (incidents.length > MAX_ENTRIES) incidents.length = MAX_ENTRIES;
    },
    appendAudit: (entry) => {
      const previous = audit.at(-1)?.hash ?? GENESIS;
      const hash = hashEntry(entry, previous);
      audit.push({ ...entry, prevHash: previous, hash });
      if (audit.length > MAX_ENTRIES) audit.shift();
    },
    appendLog: (service, line) => {
      const current = logs.get(service) ?? [];
      current.push(line);
      bound(logs, service, current.slice(-MAX_ENTRIES));
    },
    setMetric: (promql, value) => bound(metrics, promql, value),
    setCounters: (next) => {
      limits = next;
    },
  };
};
