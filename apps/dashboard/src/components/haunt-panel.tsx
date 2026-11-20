'use client';

import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react';

import { SCENARIOS } from '../lib/terms';
import { DEMO_COOLDOWN_SECONDS, useHaunt } from '../lib/use-haunt';

export function HauntPanel() {
  const [scenario, setScenario] = useState<string>(SCENARIOS[0].id);
  const haunt = useHaunt();
  const result = haunt.data;
  const busy = haunt.isPending || haunt.remaining > 0;
  const { mutate } = haunt;
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      mutate(scenario);
    },
    [mutate, scenario],
  );
  const choose = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setScenario(event.target.value),
    [],
  );
  return (
    <section
      aria-labelledby="haunt-title"
      className="rounded-md border border-pumpkin bg-crypt p-4"
    >
      <h2 id="haunt-title" className="text-sm font-semibold text-bone">
        Haunt the demo app
      </h2>
      <p className="mt-1 text-xs text-fog">
        Demo only: injects a fault into the Haunted Candy Shop, never into your services. One haunt
        per {DEMO_COOLDOWN_SECONDS} s.
      </p>
      <form className="mt-3 space-y-2" onSubmit={submit}>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Fault scenario</legend>
          {SCENARIOS.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-start gap-2 rounded-sm p-1 text-sm hover:bg-mist has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ectoplasm"
            >
              <input
                type="radio"
                name="scenario"
                value={s.id}
                checked={scenario === s.id}
                onChange={choose}
                className="mt-1 accent-pumpkin"
              />
              <span>
                <span className="font-medium text-bone">{s.id}</span>
                <span className="block text-xs text-fog">{s.plain}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-sm bg-pumpkin px-3 py-2 text-sm font-semibold text-night hover:bg-bone disabled:cursor-not-allowed disabled:bg-mist disabled:text-fog"
        >
          {haunt.isPending
            ? 'Haunting…'
            : haunt.remaining > 0
              ? `Wait ${haunt.remaining} s`
              : 'Haunt'}
        </button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs">
        {result?.ok ? (
          <span className="text-ectoplasm">Injected {result.scenario}. Watch the graveyard.</span>
        ) : result ? (
          <span className="text-pumpkin">
            {result.status === 429
              ? 'Rate limited by the daemon.'
              : result.status === 404
                ? 'Haunting is off: HAUNT_TOKEN is not set on the daemon.'
                : `Failed: ${result.message}`}
          </span>
        ) : haunt.isError ? (
          <span className="text-blood">{haunt.error.message}</span>
        ) : null}
      </p>
    </section>
  );
}
