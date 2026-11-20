'use client';

import Link from 'next/link';
import { use } from 'react';

import { IncidentTimeline } from '../../../components/incident-timeline';
import { Shell } from '../../../components/shell';
import { Term } from '../../../components/term';
import { formatTime } from '../../../lib/data/incident-model';
import { useIncident } from '../../../lib/use-incidents';

export default function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isPending, isError, error } = useIncident(decodeURIComponent(id));
  return (
    <Shell>
      <Link href="/" className="text-sm text-fog underline underline-offset-4 hover:text-bone">
        Back to the graveyard
      </Link>
      {isPending ? (
        <p role="status" className="mt-4 text-sm text-fog">
          Loading the incident…
        </p>
      ) : isError ? (
        <p role="alert" className="mt-4 rounded-md border border-blood p-4 text-sm">
          This incident could not be loaded ({error.message}). Incidents are kept in daemon memory,
          so a restart clears them.
        </p>
      ) : (
        <>
          <h1 className="mt-3 text-2xl font-bold text-bone">
            <Term name="incident" /> on {data.incident.service}
          </h1>
          <p className="mb-6 text-sm text-fog">
            {data.severity}, {data.incident.state.replace('_', ' ')}, opened{' '}
            {formatTime(data.incident.openedAt)} (Asia/Ho_Chi_Minh)
          </p>
          <IncidentTimeline view={data} />
        </>
      )}
    </Shell>
  );
}
