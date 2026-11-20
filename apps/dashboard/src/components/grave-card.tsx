import Link from 'next/link';

import { graveStatus, type GraveTone } from '../lib/data/incident-model';
import type { Grave } from '../lib/types';
import { Term } from './term';

const TONE: Record<GraveTone, { border: string; text: string; dot: string }> = {
  calm: { border: 'border-mist', text: 'text-ectoplasm', dot: 'bg-ectoplasm' },
  warning: { border: 'border-pumpkin', text: 'text-pumpkin', dot: 'bg-pumpkin' },
  critical: { border: 'border-blood', text: 'text-blood', dot: 'bg-blood' },
};

export function GraveCard({ grave }: { grave: Grave }) {
  const status = graveStatus(grave);
  const tone = TONE[status.tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-base font-semibold text-bone">{grave.name}</h3>
        <span className="text-xs text-fog">
          {grave.runtime === 'k8s' ? 'Kubernetes' : 'Docker'}
        </span>
      </div>
      <p className={`mt-3 flex items-center gap-2 text-sm font-medium ${tone.text}`}>
        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${tone.dot}`} />
        {status.term ? <Term name={status.term} /> : status.plain}
      </p>
      {status.term ? (
        <p className="mt-1 text-xs text-fog">
          {status.term === 'incident' ? status.plain : 'Service is healthy'}
        </p>
      ) : null}
    </>
  );
  const shell = `block rounded-md border-2 ${tone.border} bg-crypt p-4`;
  return grave.incidentId ? (
    <Link
      href={`/incidents/${encodeURIComponent(grave.incidentId)}`}
      className={`${shell} transition-colors hover:bg-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ectoplasm`}
      aria-label={`${grave.name}: open the incident timeline`}
    >
      {body}
    </Link>
  ) : (
    <article className={shell}>{body}</article>
  );
}
