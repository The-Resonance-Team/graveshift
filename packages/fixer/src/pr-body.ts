import { redact } from '@graveshift/redactor';

import type { Diagnosis, Incident } from '@graveshift/core';

export interface PrBodyInput {
  incident: Incident;
  diagnosis: Diagnosis;
  category: string;
  dashboardUrl: string;
  files: string[];
}

export function renderPrBody({
  incident,
  diagnosis,
  category,
  dashboardUrl,
  files,
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
    ].join('\n'),
  );
  return [
    redacted,
    '',
    `[Open the incident in the dashboard](${dashboardUrl}/incidents/${encodeURIComponent(incident.id)})`,
    '',
    '> Opened as a draft by Graveshift. It is never merged automatically: review, run CI, then merge it yourself.',
  ].join('\n');
}
