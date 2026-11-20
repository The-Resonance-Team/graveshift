'use client';

import Link from 'next/link';

import { formatTime, isOpen } from '../lib/data/incident-model';
import { useIncidents } from '../lib/use-incidents';
import { Term } from './term';

const SEVERITY_TEXT = {
  info: 'text-fog',
  warning: 'text-pumpkin',
  critical: 'text-blood',
} as const;

export function IncidentList() {
  const { data } = useIncidents();
  const open = (data ?? []).filter(isOpen);
  return (
    <section aria-labelledby="incidents-title">
      <h2 id="incidents-title" className="mb-3 text-lg font-semibold text-bone">
        Open <Term name="incident" />s{' '}
        <span className="text-sm font-normal text-fog">({open.length})</span>
      </h2>
      {open.length === 0 ? (
        <p className="rounded-md border border-mist bg-crypt p-4 text-sm text-fog">
          Nothing is haunted right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((view) => (
            <li key={view.incident.id}>
              <Link
                href={`/incidents/${encodeURIComponent(view.incident.id)}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-mist bg-crypt p-3 hover:bg-night focus-visible:outline-2 focus-visible:outline-ectoplasm"
              >
                <span className={`text-sm font-semibold ${SEVERITY_TEXT[view.severity]}`}>
                  {view.severity}
                </span>
                <span className="font-medium text-bone">{view.incident.service}</span>
                <span className="text-sm text-fog">{view.incident.state.replace('_', ' ')}</span>
                {view.pr ? (
                  <span className="text-xs text-ectoplasm">draft PR #{view.pr.number}</span>
                ) : null}
                <time dateTime={view.incident.updatedAt} className="ml-auto text-xs text-fog">
                  {formatTime(view.incident.updatedAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
