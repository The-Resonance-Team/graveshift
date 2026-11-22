import type { Diagnosis, Incident } from '@graveshift/core';

import { outboundLine, outboundText } from './outbound';
import type { VerifiedPatch } from './verify';

export interface PrBodyInput {
  incident: Incident;
  diagnosis: Diagnosis;
  category: string;
  dashboardUrl: string;
  files: string[];
  verification?: Pick<VerifiedPatch, 'changes' | 'checks'>;
}

function dashboardLink(base: string, id: string): string[] {
  try {
    const decoded = decodeURIComponent(base);
    const url = new URL(base);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username !== '' ||
      url.password !== '' ||
      /[\p{Cc}\s]/u.test(decoded) ||
      outboundText(decoded) !== decoded ||
      outboundLine(id) !== id
    ) {
      return [];
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/incidents/${encodeURIComponent(id)}`;
    url.search = '';
    url.hash = '';
    return [`[Open the incident in the dashboard](<${url.href}>)`, ''];
  } catch {
    return [];
  }
}

export function renderPrBody({
  incident,
  diagnosis,
  category,
  dashboardUrl,
  files,
  verification,
}: PrBodyInput): string {
  const evidence = diagnosis.evidence
    .map((e) => `- \`${outboundLine(e.ref)}\`: ${outboundText(e.excerpt)}`)
    .join('\n');
  const redacted = outboundText(
    [
      `## Exorcism for incident \`${outboundLine(incident.id)}\``,
      '',
      `**Service:** ${outboundLine(incident.service)}  `,
      `**Category:** ${outboundLine(category)}  `,
      `**Confidence:** ${Math.round(diagnosis.confidence * 100)}%`,
      '',
      '### Root cause',
      diagnosis.rootCause,
      '',
      '### Evidence',
      evidence,
      '',
      '### Changed files',
      files.map((f) => `- \`${outboundLine(f)}\``).join('\n'),
      ...(verification === undefined
        ? []
        : [
            '',
            '### Verification',
            ...verification.checks.map(
              (check) =>
                `- Passed: \`${outboundLine(check.command.join(' '))}\` (${check.durationMs} ms)`,
            ),
            ...verification.changes.map(
              (change) =>
                `- \`${outboundLine(change.path)}\`: +${change.added} / -${change.deleted}`,
            ),
          ]),
    ].join('\n'),
  );
  return [
    redacted,
    '',
    ...dashboardLink(dashboardUrl, incident.id),
    '> Opened as a draft by Graveshift. It is never merged automatically: review, run CI, then merge it yourself.',
  ].join('\n');
}
