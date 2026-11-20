import type { Diagnosis, Incident, IncidentState } from '@graveshift/core';
import type { Detection, Severity } from '@graveshift/watcher';

export interface TimelineEntry {
  at: string;
  type: string;
  detail: string;
}

export interface IncidentView {
  incident: Incident;
  severity: Severity;
  detections: Detection[];
  category?: string;
  diagnosisSource?: 'llm' | 'rules-only';
  needsHuman?: string;
  pr?: { url: string; number: number; branch: string };
  timeline: TimelineEntry[];
}

export type DaemonEvent =
  | { type: 'incident'; view: IncidentView }
  | { type: 'timeline'; incidentId: string; entry: TimelineEntry };

// ponytail: incidents live in memory and are lost on restart (the audit chain persists), upgrade to the store if restarts must keep them
export function createRegistry() {
  const views = new Map<string, IncidentView>();
  const listeners = new Set<(event: DaemonEvent) => void>();
  const emit = (event: DaemonEvent) => {
    for (const listener of listeners) listener(event);
  };

  const touch = (
    id: string,
    change: (view: IncidentView) => void,
    entry?: Omit<TimelineEntry, 'at'>,
    at = new Date().toISOString(),
  ) => {
    const view = views.get(id);
    if (!view) return;
    change(view);
    if (entry) {
      const full = { at, ...entry };
      view.timeline.push(full);
      emit({ type: 'timeline', incidentId: id, entry: full });
    }
    emit({ type: 'incident', view });
  };

  return {
    upsert(
      incident: Incident,
      severity: Severity,
      detections: Detection[],
      entry: Omit<TimelineEntry, 'at'>,
    ): IncidentView {
      const existing = views.get(incident.id);
      const view: IncidentView = existing
        ? {
            ...existing,
            incident: { ...incident, state: existing.incident.state },
            severity,
            detections,
          }
        : { incident, severity, detections, timeline: [] };
      views.set(incident.id, view);
      touch(incident.id, () => {}, entry, incident.updatedAt);
      return view;
    },
    setState(id: string, state: IncidentState, detail: string): void {
      touch(
        id,
        (v) => {
          v.incident = { ...v.incident, state, updatedAt: new Date().toISOString() };
        },
        { type: `state.${state}`, detail },
      );
    },
    setDiagnosis(
      id: string,
      diagnosis: Diagnosis,
      category: string,
      source: 'llm' | 'rules-only',
    ): void {
      touch(
        id,
        (v) => {
          v.incident = { ...v.incident, diagnosis };
          v.category = category;
          v.diagnosisSource = source;
        },
        {
          type: 'diagnosis',
          detail: `${category} (${Math.round(diagnosis.confidence * 100)}%, ${source}): ${diagnosis.rootCause}`,
        },
      );
    },
    needsHuman(id: string, reason: string): void {
      touch(id, (v) => void (v.needsHuman = reason), { type: 'needs_human', detail: reason });
    },
    setPr(id: string, pr: IncidentView['pr'] & {}): void {
      touch(id, (v) => void (v.pr = pr), { type: 'pr.opened', detail: pr.url });
    },
    note(id: string, type: string, detail: string): void {
      touch(id, () => {}, { type, detail });
    },
    get: (id: string) => views.get(id),
    list: () =>
      [...views.values()].sort((a, b) => b.incident.updatedAt.localeCompare(a.incident.updatedAt)),
    subscribe(listener: (event: DaemonEvent) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
export type Registry = ReturnType<typeof createRegistry>;
