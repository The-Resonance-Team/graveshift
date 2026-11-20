import type { Incident } from '@graveshift/core';

import { type Detection, type IncidentChange, type Severity, type Silence, WINDOWS } from './types';

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
export const maxSeverity = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);

export function isSilenced(silences: readonly Silence[], detection: Detection): boolean {
  const at = Date.parse(detection.observedAt);
  return silences.some(
    (s) => s.service === detection.service && Date.parse(s.from) <= at && at < Date.parse(s.until),
  );
}

export function createDedupe(windowMs: number = WINDOWS.dedupeMs) {
  const lastAccepted = new Map<string, number>();
  return {
    accept(detection: Detection): boolean {
      const at = Date.parse(detection.observedAt);
      const last = lastAccepted.get(detection.fingerprint);
      if (last !== undefined && at - last < windowMs) return false;
      lastAccepted.set(detection.fingerprint, at);
      return true;
    },
  };
}

interface Open {
  incident: Incident;
  severity: Severity;
  detections: Detection[];
}

export function createGrouper(newId: () => string = () => crypto.randomUUID()) {
  const open = new Map<string, Open>();
  return {
    add(detection: Detection): IncidentChange {
      const current = open.get(detection.service);
      if (!current) {
        const incident: Incident = {
          id: newId(),
          service: detection.service,
          state: 'open',
          signalIds: [detection.id],
          openedAt: detection.observedAt,
          updatedAt: detection.observedAt,
        };
        const entry = { incident, severity: detection.severity, detections: [detection] };
        open.set(detection.service, entry);
        return { type: 'opened', ...entry };
      }
      const entry: Open = {
        incident: {
          ...current.incident,
          signalIds: [...current.incident.signalIds, detection.id],
          updatedAt: detection.observedAt,
        },
        severity: maxSeverity(current.severity, detection.severity),
        detections: [...current.detections, detection],
      };
      open.set(detection.service, entry);
      return { type: 'updated', ...entry };
    },
    release(incidentId: string): void {
      for (const [service, entry] of open)
        if (entry.incident.id === incidentId) open.delete(service);
    },
    openIncidents: (): Open[] => [...open.values()],
  };
}
