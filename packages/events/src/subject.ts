import type { EventEnvelope } from '@graveshift/core';

/** The prefix of every Graveshift event subject. */
export const SUBJECT_PREFIX = 'graveshift';

/** The filter of the one event stream. It spans both lanes and all projects. */
export const EVENTS_SUBJECT_FILTER = `${SUBJECT_PREFIX}.>`;

/** The filter a per-Grave detection consumer uses. */
export const DETECTION_FILTER_SUBJECT = `${SUBJECT_PREFIX}.*.detection.>`;

function isSafeChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 45 ||
    code === 95
  );
}

function isSafeToken(value: string): boolean {
  if (value.length === 0) return false;
  for (const char of value) if (!isSafeChar(char)) return false;
  return true;
}

/**
 * Map a service name to one safe NATS subject token. A service that already
 * holds a safe token is unchanged; other characters collapse to an underscore.
 * // ponytail: one-token replacement, upgrade if two services collide on one token
 */
export function safeSubjectToken(service: string): string {
  if (isSafeToken(service)) return service;
  // One linear pass. A backtracking replace on untrusted text can be slow.
  const kept: string[] = [];
  let pendingUnderscore = false;
  for (const char of service) {
    if (isSafeChar(char)) {
      kept.push(char);
      pendingUnderscore = false;
    } else if (!pendingUnderscore) {
      kept.push('_');
      pendingUnderscore = true;
    }
  }
  let start = 0;
  let end = kept.length;
  while (start < end && kept[start] === '_') start += 1;
  while (end > start && kept[end - 1] === '_') end -= 1;
  return end > start ? kept.slice(start, end).join('') : '_';
}

export type Lane = 'telemetry' | 'detection';

export function laneFor(severity: EventEnvelope['severity']): Lane {
  return severity === 'info' ? 'telemetry' : 'detection';
}

/**
 * Fail closed on an unvalidated caller. The primary rule is EventEnvelopeSchema
 * in packages/core: projectId is one token and type is a dotted list of tokens.
 * A type keeps its dots; neither part may carry a wildcard or a wildcard-like
 * empty token.
 */
function assertSafeSubjectPart(value: string, name: 'projectId' | 'type'): void {
  if (name === 'projectId' && value.includes('.')) {
    throw new Error(`Unsafe ${name} in event subject`);
  }
  const tokens = value.split('.');
  if (tokens.some((token) => !isSafeToken(token))) {
    throw new Error(`Unsafe ${name} in event subject`);
  }
}

/** Build `graveshift.<projectId>.<lane>.<grave>.<type>`. */
export function publishSubject(envelope: EventEnvelope): string {
  assertSafeSubjectPart(envelope.projectId, 'projectId');
  assertSafeSubjectPart(envelope.type, 'type');
  const grave = safeSubjectToken(envelope.service);
  return `${SUBJECT_PREFIX}.${envelope.projectId}.${laneFor(envelope.severity)}.${grave}.${envelope.type}`;
}

/** Build the dead-letter subject for an exhausted detection envelope. */
export function deadLetterSubject(projectId: string, grave: string): string {
  assertSafeSubjectPart(projectId, 'projectId');
  return `${SUBJECT_PREFIX}.${projectId}.dlq.${safeSubjectToken(grave)}`;
}
