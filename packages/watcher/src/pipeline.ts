import type { Incident } from '@graveshift/core';

import { type Detection, type IncidentChange, type Severity, type Silence, WINDOWS } from './types';

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
export const maxSeverity = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);

export function isSilenced(silences: readonly Silence[], detection: Detection): boolean {
  const at = Date.parse(detection.observedAt);
  return silences.some(
    (s) =>
      s.projectId === detection.projectId &&
      s.service === detection.service &&
      Date.parse(s.from) <= at &&
      at < Date.parse(s.until),
  );
}

export function createDedupe(windowMs: number = WINDOWS.dedupeMs) {
  const lastAccepted = new Map<string, number>();
  return {
    accept(detection: Detection): boolean {
      const at = Date.parse(detection.observedAt);
      const key = JSON.stringify([detection.projectId, detection.service, detection.fingerprint]);
      const last = lastAccepted.get(key);
      if (last !== undefined && at - last < windowMs) return false;
      lastAccepted.set(key, at);
      return true;
    },
  };
}

interface Open {
  projectId: string;
  incident: Incident;
  severity: Severity;
  detections: Detection[];
}

export function createGrouper(newId: () => string = () => crypto.randomUUID()) {
  const open = new Map<string, Open>();
  return {
    add(detection: Detection): IncidentChange {
      const key = JSON.stringify([detection.projectId, detection.service]);
      const current = open.get(key);
      if (!current) {
        const incident: Incident = {
          id: newId(),
          service: detection.service,
          state: 'open',
          signalIds: [detection.id],
          openedAt: detection.observedAt,
          updatedAt: detection.observedAt,
        };
        const entry = {
          projectId: detection.projectId,
          incident,
          severity: detection.severity,
          detections: [detection],
        };
        open.set(key, entry);
        return structuredClone({ type: 'opened', ...entry });
      }
      const entry: Open = {
        projectId: detection.projectId,
        incident: {
          ...current.incident,
          signalIds: [...current.incident.signalIds, detection.id],
          updatedAt: detection.observedAt,
        },
        severity: maxSeverity(current.severity, detection.severity),
        detections: [...current.detections, detection],
      };
      open.set(key, entry);
      return structuredClone({ type: 'updated', ...entry });
    },
    release(projectId: string, incidentId: string): void {
      for (const [service, entry] of open)
        if (entry.projectId === projectId && entry.incident.id === incidentId) open.delete(service);
    },
    openIncidents: (): Open[] => structuredClone([...open.values()]),
  };
}
