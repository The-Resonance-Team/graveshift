import { prepareRecordedHaunting, type RecordedHaunting } from '@graveshift/core/recorded';

/** Autopsy: the postmortem for a closed incident, built only from recorded facts. */
export function writeAutopsy(input: RecordedHaunting): string {
  const view = prepareRecordedHaunting(input);
  const { incident } = view;
  const diagnosis = incident.diagnosis;
  const lines = [
    `# Autopsy: ${incident.service} (${incident.id})`,
    '',
    `- State: ${incident.state}`,
    `- Severity: ${view.severity ?? 'unknown'}`,
    `- Opened: ${incident.openedAt}`,
    `- Resolved: ${incident.resolvedAt ?? 'not resolved'}`,
    '',
    '## Root cause',
    diagnosis?.rootCause ?? 'No diagnosis was recorded.',
  ];
  if (diagnosis?.confidence !== undefined) lines.push('', `Confidence: ${diagnosis.confidence}`);
  if (diagnosis?.evidence?.length) {
    lines.push('', '## Evidence');
    for (const e of diagnosis.evidence) lines.push(`- ${e.ref}: ${e.excerpt}`);
  }
  lines.push('', '## Timeline');
  for (const t of view.timeline ?? []) lines.push(`- ${t.at} ${t.type}: ${t.detail}`);
  if (!view.timeline?.length) lines.push('- No timeline entries recorded.');
  lines.push(
    '',
    '## Fix',
    view.pr ? `Draft PR: ${view.pr.url} (branch ${view.pr.branch})` : 'No PR was opened.',
  );
  return lines.join('\n');
}
