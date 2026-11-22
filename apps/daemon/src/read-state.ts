import {
  type AuditEntry,
  type AuditInput,
  type ChainResult,
  type CounterSnapshot,
  type CounterSource,
  GENESIS_ANCHOR,
  type IncidentView,
  type LimitCounters,
  makeAuditEntry,
  type ServiceView,
  verifyEntries,
} from '@graveshift/core';

export interface DaemonReadState {
  listServices(): ServiceView[];
  listIncidents(): IncidentView[];
  getIncident(id: string): IncidentView | undefined;
  listAudit(afterSeq: number, limit: number): AuditEntry[];
  verifyChain(): ChainResult;
  tailLogs(service: string, lines: number): string[];
  queryMetric(promql: string): number | null;
  counters(): CounterSnapshot;
  recordIncident(view: IncidentView): void;
  appendAudit(entry: AuditDraftInput): void;
  appendLog(service: string, line: string): void;
  setMetric(promql: string, value: number): void;
  setCounters(counters: LimitCounters, source?: CounterSource): void;
}

type AuditDraftInput = AuditInput & { at: string };

const MAX_ENTRIES = 200;

const bound = <T>(map: Map<string, T>, key: string, value: T): void => {
  if (map.size >= MAX_ENTRIES && !map.has(key)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
};

/** The daemon's own in-memory state. Real writers are not wired yet; the HTTP routes only read. */
export const createReadState = (): DaemonReadState => {
  const incidents: IncidentView[] = [];
  const audit: AuditEntry[] = [];
  const logs = new Map<string, string[]>();
  const metrics = new Map<string, number>();
  let limits: LimitCounters = {
    openPrsLastHour: 0,
    actionsLast10Min: 0,
    diagnosisLoops: 0,
    llmSpentTodayUsd: 0,
  };
  let source: CounterSource = 'not_wired';
  let nextSeq = GENESIS_ANCHOR.seq;
  let anchor = GENESIS_ANCHOR;

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
    verifyChain: () => verifyEntries(audit, anchor),
    tailLogs: (service, lines) => (logs.get(service) ?? []).slice(-lines),
    queryMetric: (promql) => metrics.get(promql) ?? null,
    counters: () => ({ source, counters: limits }),
    recordIncident: (view) => {
      const index = incidents.findIndex((item) => item.incident.id === view.incident.id);
      if (index === -1) incidents.unshift(view);
      else incidents[index] = view;
      if (incidents.length > MAX_ENTRIES) incidents.length = MAX_ENTRIES;
    },
    appendAudit: (entry) => {
      const previous = audit.at(-1)?.hash ?? anchor.prevHash;
      audit.push(makeAuditEntry(nextSeq, entry.at, entry, previous));
      nextSeq += 1;
      if (audit.length > MAX_ENTRIES) {
        const evicted = audit.shift();
        if (evicted !== undefined) anchor = { seq: evicted.seq + 1, prevHash: evicted.hash };
      }
    },
    appendLog: (service, line) => {
      const current = logs.get(service) ?? [];
      current.push(line);
      bound(logs, service, current.slice(-MAX_ENTRIES));
    },
    setMetric: (promql, value) => bound(metrics, promql, value),
    setCounters: (next, nextSource = 'not_wired') => {
      limits = next;
      source = nextSource;
    },
  };
};
