'use client';

import { MODE_COPY } from '../lib/terms';
import { useMode } from '../lib/use-mode';

export function ModeView() {
  const { data, isError } = useMode();
  return (
    <section aria-labelledby="mode-title" className="rounded-md border border-mist bg-crypt p-4">
      <h2 id="mode-title" className="text-sm font-semibold text-bone">
        Mode
      </h2>
      {isError ? (
        <p className="mt-1 text-sm text-fog">Unknown: the daemon did not answer.</p>
      ) : !data ? (
        <p role="status" className="mt-1 text-sm text-fog">
          Loading…
        </p>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-ectoplasm">{data.effective}</p>
          <p className="text-sm text-fog">{MODE_COPY[data.effective]}</p>
          {data.policy !== data.effective ? (
            <p className="mt-1 text-xs text-fog">
              policy.yaml says {data.policy}; the environment lowered it.
            </p>
          ) : null}
          {data.warning ? (
            <p
              role="note"
              className="mt-2 rounded-sm border border-pumpkin px-2 py-1 text-xs text-pumpkin"
            >
              Ignored override: {data.warning}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
