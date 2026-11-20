'use client';

import { formatTime } from '../lib/data/incident-model';
import { useAudit, useChain } from '../lib/use-audit';
import { Term } from './term';

function ChainBadge() {
  const { data, isError } = useChain();
  if (isError)
    return (
      <span className="rounded-sm border border-pumpkin px-2 py-0.5 text-xs text-pumpkin">
        Chain not checked
      </span>
    );
  if (!data) return <span className="text-xs text-fog">Checking…</span>;
  return data.ok ? (
    <span className="rounded-sm border border-ectoplasm px-2 py-0.5 text-xs text-ectoplasm">
      Chain verified: {data.length} entries
    </span>
  ) : (
    <span role="alert" className="rounded-sm border border-blood px-2 py-0.5 text-xs text-blood">
      Chain broken at entry {data.brokenAtSeq}: {data.reason}
    </span>
  );
}

export function AuditPanel() {
  const { data } = useAudit();
  const recent = (data ?? []).toReversed().slice(0, 8);
  return (
    <section aria-labelledby="audit-title" className="rounded-md border border-mist bg-crypt p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="audit-title" className="text-sm font-semibold text-bone">
          <Term name="auditLog" />
        </h2>
        <ChainBadge />
      </div>
      {recent.length === 0 ? (
        <p className="mt-2 text-sm text-fog">No decisions recorded yet.</p>
      ) : (
        <ol className="mt-2 space-y-1 text-xs">
          {recent.map((entry) => (
            <li key={entry.seq} className="flex gap-2">
              <span className="w-8 shrink-0 text-right text-fog">#{entry.seq}</span>
              <span className="text-bone">{entry.type}</span>
              <time dateTime={entry.at} className="ml-auto shrink-0 text-fog">
                {formatTime(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
