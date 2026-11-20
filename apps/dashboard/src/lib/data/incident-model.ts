import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import type { Grave, IncidentView, TimelineEntry } from '../types';
import type { TermKey } from '../terms';

export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const formatTime = (iso: string): string =>
  format(new TZDate(iso, TIMEZONE), 'HH:mm:ss, d MMM');

const CLOSED = new Set(['resolved', 'dismissed']);
export const isOpen = (view: IncidentView): boolean => !CLOSED.has(view.incident.state);

export function upsertIncident(
  list: IncidentView[] | undefined,
  view: IncidentView,
): IncidentView[] {
  const rest = (list ?? []).filter((v) => v.incident.id !== view.incident.id);
  return [view, ...rest].sort((a, b) => b.incident.updatedAt.localeCompare(a.incident.updatedAt));
}

export function patchGraveyard(
  graves: Grave[] | undefined,
  view: IncidentView,
): Grave[] | undefined {
  if (!graves) return graves;
  return graves.map((grave) => {
    if (grave.name !== view.incident.service) return grave;
    const { incidentId: _id, severity: _sev, state: _state, ...base } = grave;
    return isOpen(view)
      ? {
          ...base,
          incidentId: view.incident.id,
          severity: view.severity,
          state: view.incident.state,
        }
      : base;
  });
}

export type GraveTone = 'calm' | 'warning' | 'critical';

export function graveStatus(grave: Grave): {
  tone: GraveTone;
  term: TermKey | null;
  plain: string;
} {
  if (grave.incidentId) {
    return {
      tone: grave.severity === 'critical' ? 'critical' : 'warning',
      term: 'incident',
      plain: `incident is ${grave.state?.replace('_', ' ') ?? 'open'}`,
    };
  }
  if (grave.health === 'healthy') return { tone: 'calm', term: 'healthy', plain: 'healthy' };
  if (grave.health === 'unknown') return { tone: 'warning', term: null, plain: 'Health unknown' };
  return {
    tone: grave.health === 'unhealthy' ? 'critical' : 'warning',
    term: null,
    plain: grave.health === 'unhealthy' ? 'Unhealthy' : 'Degraded',
  };
}

export const PHASES = [
  { key: 'watcher', label: 'Detected' },
  { key: 'diagnoser', label: 'Diagnosed' },
  { key: 'fixer', label: 'Fix proposed' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'postmortem', label: 'Postmortem' },
] as const;
export type Phase = (typeof PHASES)[number]['key'];

export function phaseOf(entry: TimelineEntry): Phase {
  if (entry.type.startsWith('signal.')) return 'watcher';
  if (
    entry.type === 'diagnosis' ||
    entry.type === 'needs_human' ||
    entry.type.startsWith('state.diagnos')
  )
    return 'diagnoser';
  if (entry.type === 'policy' || entry.type.startsWith('pr.')) return 'fixer';
  if (entry.type === 'state.resolved' || entry.type === 'state.dismissed') return 'resolved';
  if (entry.type.startsWith('autopsy')) return 'postmortem';
  return 'watcher';
}

export function reachedPhases(view: IncidentView): Set<Phase> {
  return new Set(view.timeline.map(phaseOf));
}
