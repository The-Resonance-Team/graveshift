'use client';

import { formatTime, PHASES, phaseOf, reachedPhases } from '../lib/data/incident-model';
import { RULE_TERM, type TermKey } from '../lib/terms';
import type { IncidentView } from '../lib/types';
import { Term } from './term';

const PHASE_TERM: Record<(typeof PHASES)[number]['key'], TermKey | null> = {
  watcher: 'watcher',
  diagnoser: 'diagnoser',
  fixer: 'fixer',
  resolved: null,
  postmortem: 'postmortem',
};

export function IncidentTimeline({ view }: { view: IncidentView }) {
  const reached = reachedPhases(view);
  const themedRules = [
    ...new Set(
      view.detections.map((d) => RULE_TERM[d.rule]).filter((t): t is TermKey => t !== undefined),
    ),
  ];
  return (
    <div className="space-y-6">
      <ol aria-label="Progress" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PHASES.map((phase) => {
          const done = reached.has(phase.key);
          const term = PHASE_TERM[phase.key];
          return (
            <li
              key={phase.key}
              className={`rounded-sm border px-3 py-2 text-sm ${done ? 'border-ectoplasm text-ectoplasm' : 'border-mist text-fog'}`}
            >
              <span className="block font-semibold">
                {term ? <Term name={term} /> : 'Resolved'}
              </span>
              <span className="text-xs">
                {phase.label}
                {done ? '' : ' (pending)'}
              </span>
            </li>
          );
        })}
      </ol>

      {themedRules.length > 0 ? (
        <p className="text-sm text-bone">
          Signs:{' '}
          {themedRules.map((t, i) => (
            <span key={t}>
              {i > 0 ? ', ' : ''}
              <Term name={t} className="text-pumpkin" />
            </span>
          ))}
        </p>
      ) : null}

      {view.incident.diagnosis ? (
        <section
          aria-labelledby="diagnosis-title"
          className="rounded-md border border-mist bg-crypt p-4"
        >
          <h2 id="diagnosis-title" className="text-sm font-semibold text-bone">
            <Term name="diagnosis" />{' '}
            <span className="font-normal text-fog">
              {view.category}, {Math.round(view.incident.diagnosis.confidence * 100)}% confidence,{' '}
              {view.diagnosisSource}
            </span>
          </h2>
          <p className="mt-1 text-bone">{view.incident.diagnosis.rootCause}</p>
          <ul className="mt-2 space-y-1 text-xs text-fog">
            {view.incident.diagnosis.evidence.map((e) => (
              <li key={e.ref}>
                <code className="text-bone">{e.ref}</code> {e.excerpt}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.needsHuman ? (
        <p role="alert" className="rounded-md border border-pumpkin p-3 text-sm text-pumpkin">
          Needs a human: {view.needsHuman}
        </p>
      ) : null}

      <section aria-labelledby="pr-title" className="rounded-md border border-mist bg-crypt p-4">
        <h2 id="pr-title" className="text-sm font-semibold text-bone">
          <Term name="fixPr" />
        </h2>
        {view.pr ? (
          <a
            href={view.pr.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-ectoplasm underline underline-offset-4"
          >
            Draft PR #{view.pr.number} on {view.pr.branch.replace('refs/heads/', '')} (opens GitHub)
          </a>
        ) : (
          <p className="mt-1 text-sm text-fog">No draft pull request yet.</p>
        )}
      </section>

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="mb-2 text-sm font-semibold text-bone">
          Timeline
        </h2>
        <ol className="space-y-2 border-l-2 border-mist pl-4">
          {view.timeline.map((entry) => (
            <li key={`${entry.at}-${entry.type}`} className="text-sm">
              <time dateTime={entry.at} className="text-xs text-fog">
                {formatTime(entry.at)}
              </time>{' '}
              <span className="text-xs text-fog">[{phaseOf(entry)}]</span>{' '}
              <span className="font-medium text-bone">{entry.type}</span>
              <p className="text-fog">{entry.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
