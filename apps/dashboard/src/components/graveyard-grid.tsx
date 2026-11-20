'use client';

import { useCallback } from 'react';

import { useGraveyard } from '../lib/use-graveyard';
import { GraveCard } from './grave-card';
import { Term } from './term';

export function GraveyardGrid() {
  const { data, isPending, isError, error, refetch } = useGraveyard();
  const retry = useCallback(() => void refetch(), [refetch]);
  return (
    <section aria-labelledby="graves-title">
      <h2 id="graves-title" className="mb-3 text-lg font-semibold text-bone">
        <Term name="dashboard" />
      </h2>
      {isPending ? (
        <p role="status" className="text-sm text-fog">
          Loading watched services…
        </p>
      ) : isError ? (
        <div role="alert" className="rounded-md border border-blood bg-crypt p-4 text-sm text-bone">
          <p>Could not reach the Graveshift daemon ({error.message}).</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-sm bg-mist px-3 py-1.5 text-bone hover:bg-fog hover:text-night"
          >
            Try again
          </button>
        </div>
      ) : data.length === 0 ? (
        <p className="rounded-md border border-mist bg-crypt p-4 text-sm text-fog">
          No services are watched yet. Start the demo app or set WATCH_SERVICES on the daemon.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((grave) => (
            <li key={grave.name}>
              <GraveCard grave={grave} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
