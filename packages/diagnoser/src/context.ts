import {
  neutralizeUntrusted,
  UNTRUSTED_SYSTEM_NOTE,
  wrapUntrusted,
} from '@graveshift/agents/untrusted';
import { redact } from '@graveshift/redactor';

import { LIMITS, type ContextBundle, type DiagnoseInput, type PreparedEvidence } from './types';

const clean = (text: string): string => neutralizeUntrusted(redact(text));

export function buildContext({
  incident,
  detections,
  logs,
  files,
  commits,
}: DiagnoseInput): ContextBundle {
  const evidence: PreparedEvidence[] = [
    {
      kind: 'incident',
      ref: 'incident:1',
      text: `incident on service ${clean(incident.service)}`,
    },
  ];
  detections.forEach((detection, index) =>
    evidence.push({
      kind: 'signal',
      ref: `signal:${index + 1}`,
      rule: clean(detection.rule),
      text: clean(`${detection.rule}: ${detection.message}`),
    }),
  );

  // Redact each whole block before taking its retained lines. A secret can span the boundary.
  const logLines =
    logs.length === 0 ? [] : clean(logs.join('\n')).split('\n').slice(-LIMITS.logLines);
  logLines.forEach((text, index) => evidence.push({ kind: 'log', ref: `log:${index + 1}`, text }));
  files.slice(0, LIMITS.files).forEach((file, index) =>
    evidence.push({
      kind: 'file',
      ref: `file:${index + 1}`,
      label: clean(file.path),
      text: clean(file.content).split('\n').slice(0, LIMITS.fileLines).join('\n'),
    }),
  );
  commits.slice(0, LIMITS.commits).forEach((commit, index) =>
    evidence.push({
      kind: 'commit',
      ref: `commit:${index + 1}`,
      label: clean(commit.sha),
      text: clean(commit.message),
    }),
  );

  const section = (tag: string, entries: readonly PreparedEvidence[]) =>
    wrapUntrusted(
      tag,
      entries
        .map(({ ref, text, label }) => `[${ref}] ${label === undefined ? '' : `${label}\n`}${text}`)
        .join('\n'),
    );
  const parts = [
    section(
      'incident',
      evidence.filter(({ kind }) => kind === 'incident'),
    ),
    section(
      'signals',
      evidence.filter(({ kind }) => kind === 'signal'),
    ),
    section(
      'logs',
      evidence.filter(({ kind }) => kind === 'log'),
    ),
    ...evidence.filter(({ kind }) => kind === 'file').map((file) => section('file', [file])),
    section(
      'commits',
      evidence.filter(({ kind }) => kind === 'commit'),
    ),
  ];
  return {
    prompt: parts.join('\n\n'),
    refs: new Map(evidence.map(({ ref, text }) => [ref, text])),
    evidence,
  };
}

export const SYSTEM_PROMPT = [
  'You are Medium, an SRE diagnosis assistant. Diagnose the root cause of the incident.',
  UNTRUSTED_SYSTEM_NOTE,
  'Answer with one JSON object: {"category","rootCause","confidence","evidence":[{"ref","excerpt"}]}.',
  'category is one of code_bug, config_error, deploy_regression, resource_exhaustion, unknown.',
  'Pick the category by the failure mechanism: resource_exhaustion when memory, CPU, disk or connections run out (OOM kills, restart loops), even if a recent commit caused it; code_bug for a defect in the code itself; config_error for wrong settings or environment values; deploy_regression only when a release broke behavior and no more specific mechanism fits.',
  'Every evidence ref must be a [ref] label that appears in the context, and its excerpt must quote that evidence. If unsure use category "unknown" with confidence below 0.5.',
].join('\n');
