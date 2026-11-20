'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import { type TermKey, TERMS } from '../lib/terms';
import { Term } from './term';

const STORAGE_KEY = 'graveshift.first-run.done';

const STEPS = [
  {
    title: 'Start the crew',
    body: 'Run the daemon next to your services. The demo stack starts everything at once:',
    code: 'docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml up -d --build',
  },
  {
    title: 'Check the policy',
    body: 'Graveshift reads policy.yaml. It starts in propose mode: draft pull requests only, every runtime action needs a blessing.',
    code: 'bun packages/policy/src/cli.ts policy check policy.yaml',
  },
  {
    title: 'Learn the words',
    body: 'Every spooky label has a plain meaning. Hover or Tab onto it to read it.',
    code: null,
  },
] as const;

// localStorage as an external store: the server snapshot says "dismissed" so nothing flashes before hydration
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
const readDismissed = () => window.localStorage.getItem(STORAGE_KEY) === '1';
const markDismissed = () => {
  window.localStorage.setItem(STORAGE_KEY, '1');
  for (const listener of listeners) listener();
};

export function FirstRunWizard({ needed }: { needed: boolean }) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [step, setStep] = useState(0);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const next = useCallback(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), []);
  if (!needed || dismissed) return null;
  const current = STEPS[step] ?? STEPS[0];
  return (
    <section
      aria-labelledby="wizard-title"
      className="rounded-md border-2 border-ectoplasm bg-crypt p-5"
    >
      <p className="text-xs text-fog">
        First run, step {step + 1} of {STEPS.length}
      </p>
      <h2 id="wizard-title" className="mt-1 text-lg font-semibold text-bone">
        {current.title}
      </h2>
      <p className="mt-1 text-sm text-fog">{current.body}</p>
      {current.code ? (
        <pre className="mt-3 overflow-x-auto rounded-sm bg-night p-3 text-xs text-bone">
          <code>{current.code}</code>
        </pre>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {(Object.keys(TERMS) as TermKey[]).map((key) => (
            <li key={key} className="text-bone">
              <Term name={key} />{' '}
              <span className="text-fog">means {TERMS[key].plain.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="rounded-sm bg-mist px-3 py-1.5 text-sm text-bone hover:bg-fog hover:text-night"
          >
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="rounded-sm bg-ectoplasm px-3 py-1.5 text-sm font-semibold text-night hover:bg-bone"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={markDismissed}
            className="rounded-sm bg-ectoplasm px-3 py-1.5 text-sm font-semibold text-night hover:bg-bone"
          >
            Done
          </button>
        )}
        <button
          type="button"
          onClick={markDismissed}
          className="ml-auto text-sm text-fog underline underline-offset-4 hover:text-bone"
        >
          Skip setup
        </button>
      </div>
    </section>
  );
}
