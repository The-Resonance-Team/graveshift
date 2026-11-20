import type { QueryClient } from '@tanstack/react-query';

import { keys } from '../query-keys';
import type { DaemonEvent, Grave, IncidentView } from '../types';
import { patchGraveyard, upsertIncident } from './incident-model';

export function applyDaemonEvent(qc: QueryClient, event: DaemonEvent): void {
  if (event.type === 'incident') {
    const { view } = event;
    qc.setQueryData<IncidentView[]>(keys.incidents, (list) => upsertIncident(list, view));
    qc.setQueryData<IncidentView>(keys.incident(view.incident.id), view);
    qc.setQueryData<Grave[]>(keys.graveyard, (graves) => patchGraveyard(graves, view));
    void qc.invalidateQueries({ queryKey: keys.audit });
    return;
  }
  qc.setQueryData<IncidentView>(keys.incident(event.incidentId), (view) =>
    view && !view.timeline.some((t) => t.at === event.entry.at && t.type === event.entry.type)
      ? { ...view, timeline: [...view.timeline, event.entry] }
      : view,
  );
}
