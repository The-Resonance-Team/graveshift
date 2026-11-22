import { redact } from '@graveshift/redactor';

import type { Diagnosis, Incident } from '@graveshift/core';

import type { CheckOutcome } from './sandbox';
import type { PullDiffSummary } from './types';

export interface PrBodyInput {
  incident: Incident;
  diagnosis: Diagnosis;
  category: string;
  dashboardUrl: string;
  files: string[];
  checks: readonly CheckOutcome[];
  diff: PullDiffSummary;
}

const checkLine = (check: CheckOutcome): string => {
  const command = redact(check.command.join(' '));
  if (check.timedOut) return `- \`${command}\`: timed out`;
  if (check.exitCode === 0) return `- \`${command}\`: passed`;
  return `- \`${command}\`: exit ${check.exitCode ?? 'unknown'}`;
};

const checkOutput = (check: CheckOutcome): string[] => {
  const lines: string[] = [];
  const stdout = check.stdout.trim();
  const stderr = check.stderr.trim();
  if (stdout !== '') lines.push('', '```', redact(stdout.slice(-2_000)), '```');
  if (stderr !== '') lines.push('', '```', redact(stderr.slice(-2_000)), '```');
  return lines;
};

export function renderPrBody({
  incident,
  diagnosis,
  category,
  dashboardUrl,
  files,
  checks,
  diff,
}: PrBodyInput): string {
  const evidence = diagnosis.evidence.map((e) => `- \`${e.ref}\`: ${e.excerpt}`).join('\n');
  // the link is built from our own values, so it is appended after redaction (the entropy detector would mangle it)
  const redacted = redact(
    [
      `## Exorcism for incident \`${incident.id}\``,
      '',
      `**Service:** ${incident.service}  `,
      `**Category:** ${category}  `,
      `**Confidence:** ${Math.round(diagnosis.confidence * 100)}%`,
      '',
      '### Root cause',
      diagnosis.rootCause,
      '',
      '### Evidence',
      evidence,
      '',
      '### Changed files',
      files.map((f) => `- \`${f}\``).join('\n'),
      '',
      `### Diff stats (${diff.filesChanged} files, +${diff.additions}/-${diff.deletions})`,
      '',
      '### Checks',
      ...(checks.length === 0 ? ['- none configured'] : checks.flatMap(checkLine)),
      ...checks.flatMap(checkOutput),
    ].join('\n'),
  );
  // No dashboard URL means no link: an empty base would produce a broken relative link.
  const link =
    dashboardUrl === ''
      ? []
      : [
          `[Open the incident in the dashboard](${dashboardUrl}/incidents/${encodeURIComponent(incident.id)})`,
          '',
        ];
  return [
    redacted,
    '',
    ...link,
    '> Opened as a draft by Graveshift. It is never merged automatically: review, run CI, then merge it yourself.',
  ].join('\n');
}
