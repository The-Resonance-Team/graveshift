import { redact } from '@graveshift/redactor';

import type { Incident } from '@graveshift/core';

import type { CheckOutcome } from './sandbox';
import { SANDBOX_OUTPUT_CAP } from './spawn';
import type { PullDiffSummary } from './types';

/**
 * A pull request carries identifiers, check results and diff stats. The work
 * item title, the root cause and a Fix now note stay on the work item and in
 * the API result: reviewer-facing prose belongs there, not in the published
 * description, and the fewer copies of request text there are, the smaller the
 * surface that has to stay redacted.
 */
export interface PrBodyInput {
  incident: Incident;
  category: string;
  confidence: number;
  dashboardUrl: string;
  files: string[];
  checks: readonly CheckOutcome[];
  diff: PullDiffSummary;
}

const checkLine = (check: CheckOutcome): string => {
  const command = redact(check.command.join(' '));
  if (check.timedOut) return `- \`${command}\`: timed out`;
  if (check.exitCode === null) return `- \`${command}\`: did not run`;
  if (check.exitCode === 0) return `- \`${command}\`: passed`;
  return `- \`${command}\`: exit ${check.exitCode}`;
};

const checkOutput = (check: CheckOutcome): string[] => {
  const lines: string[] = [];
  const stdout = check.stdout.trim();
  const stderr = check.stderr.trim();
  if (stdout !== '') {
    lines.push('', '```', redact(stdout.slice(-2_000)), '```');
    if (check.stdoutTruncated) lines.push(`(stdout capped at ${SANDBOX_OUTPUT_CAP} bytes)`);
  }
  if (stderr !== '') {
    lines.push('', '```', redact(stderr.slice(-2_000)), '```');
    if (check.stderrTruncated) lines.push(`(stderr capped at ${SANDBOX_OUTPUT_CAP} bytes)`);
  }
  return lines;
};

export function renderPrBody({
  incident,
  category,
  confidence,
  dashboardUrl,
  files,
  checks,
  diff,
}: PrBodyInput): string {
  // the link is built from our own values, so it is appended after redaction (the entropy detector would mangle it)
  const redacted = redact(
    [
      `## Exorcism for incident \`${incident.id}\``,
      '',
      `**Service:** ${incident.service}  `,
      `**Category:** ${category}  `,
      `**Confidence:** ${Math.round(confidence * 100)}%`,
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
