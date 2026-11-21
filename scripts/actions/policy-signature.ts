import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface DecisionBinding {
  repository: string;
  workItemId: string;
  incidentRef: string;
  branchSlug: string;
  baseRef: string;
  baseSha: string;
  prTitle: string;
  patchPayload: string;
}

const MAX_AGE_MS = 5 * 60_000;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('policy decision must be an object');
  }
  return value as Record<string, unknown>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('policy decision is not JSON');
  return encoded;
}

function boundFields(binding: DecisionBinding) {
  const { patchPayload, ...fields } = binding;
  return {
    version: 1,
    ...fields,
    patchSha256: createHash('sha256').update(patchPayload).digest('hex'),
  };
}

function requireKey(secret: string | undefined): string {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('policy signing key must be at least 32 bytes');
  }
  return secret;
}

/** The trusted platform signs only after its policy engine has returned allow. */
export function signPolicyDecision(
  raw: string,
  binding: DecisionBinding,
  secret: string,
  now = Date.now(),
): { policyDecision: string; signature: string } {
  const decision = object(JSON.parse(raw));
  if (decision.effect !== 'allow' || decision.action !== 'open_pr') {
    throw new Error('only an open_pr allow decision can be signed');
  }
  const policyDecision = canonical({
    ...decision,
    signed: {
      ...boundFields(binding),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + MAX_AGE_MS).toISOString(),
    },
  });
  return {
    policyDecision,
    signature: createHmac('sha256', requireKey(secret)).update(policyDecision).digest('hex'),
  };
}

export function verifyPolicySignature(
  raw: string | undefined,
  signature: string | undefined,
  secret: string | undefined,
  binding: DecisionBinding,
  now = Date.now(),
): void {
  const key = requireKey(secret);
  if (raw === undefined) throw new Error('policy_decision is missing');
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) {
    throw new Error('policy_signature must be a SHA-256 hex digest');
  }
  const decision = object(JSON.parse(raw));
  const expected = createHmac('sha256', key).update(canonical(decision)).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    throw new Error('policy signature is invalid');
  }
  if (decision.effect !== 'allow' || decision.action !== 'open_pr') {
    throw new Error('signed decision must allow open_pr');
  }
  const signed = object(decision.signed);
  if (Object.entries(boundFields(binding)).some(([field, value]) => signed[field] !== value)) {
    throw new Error('signed decision does not match this job');
  }
  const issuedAt = typeof signed.issuedAt === 'string' ? Date.parse(signed.issuedAt) : NaN;
  const expiresAt = typeof signed.expiresAt === 'string' ? Date.parse(signed.expiresAt) : NaN;
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > now + 30_000 ||
    expiresAt <= issuedAt ||
    expiresAt <= now ||
    expiresAt - issuedAt > MAX_AGE_MS
  ) {
    throw new Error('signed decision has an invalid or expired lifetime');
  }
}
