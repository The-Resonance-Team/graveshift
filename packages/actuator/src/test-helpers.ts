import { loadGraveshiftConfig } from '@graveshift/config';
import type { AuditDraft } from '@graveshift/core';

import * as execution from './execute';
import { createAdmissionFixture } from './admission-fixture';
import { createBreaker } from './guards';
import { signRequest } from './sign';
import type { ActionRequest, RequiredAudit, UnsignedRequest } from './types';

export const SECRET = 's'.repeat(40);
// Use the one boot config file, but force act mode so actuator tests exercise real actions.
export const policy = {
  ...(await loadGraveshiftConfig()).policy,
  mode: 'act' as const,
};
export const APPROVER = policy.approvers.discordUserIds[0] ?? '';
export const T0 = Date.parse('2026-11-20T10:00:00.000Z');
export const iso = (ms: number) => new Date(ms).toISOString();

export function setup(at = T0, options: Partial<execution.ActuatorOptions> = {}) {
  const calls: string[] = [];
  const audits: AuditDraft[] = [];
  let now = at;
  const pages: string[] = [];
  const requiredAudit: RequiredAudit =
    options.requiredAudit ??
    (async (draft) => {
      audits.push(draft);
      return { key: draft.key };
    });
  const store = createAdmissionFixture(options.policy ?? policy, () => now, requiredAudit);
  const actuator = execution.createActuator({
    secret: SECRET,
    requiredAudit,
    durableAdmission: store.admission,
    policy,
    namespace: 'candy-shop',
    now: () => now,
    docker: { restart: async (service) => void calls.push(`docker.restart:${service}`) },
    kube: {
      rolloutRestart: async (ns, name) => void calls.push(`k8s.restart:${ns}/${name}`),
      scale: async (ns, name, n) => void calls.push(`k8s.scale:${ns}/${name}=${n}`),
    },
    breaker: createBreaker({ page: (service) => pages.push(service) }),
    ...options,
  });
  return { actuator, calls, audits, pages, store, setNow: (ms: number) => (now = ms) };
}

export const unsigned = (
  over: {
    service?: string;
    kind?: 'restart' | 'scale';
    runtime?: 'docker' | 'k8s';
    replicas?: number;
    approvedBy?: string;
    ttlMs?: number;
    issuedOffset?: number;
    tokenId?: string;
    actionId?: string;
    signals?: string[];
    confidence?: number;
  } = {},
): UnsignedRequest => {
  const issued = T0 + (over.issuedOffset ?? -1000);
  const kind = over.kind ?? 'restart';
  const actionId = over.actionId ?? (over.tokenId === undefined ? 'act-1' : `act-${over.tokenId}`);
  return {
    action: {
      id: actionId,
      incidentId: 'inc-1',
      service: over.service ?? 'api',
      runtime: over.runtime ?? 'k8s',
      kind,
      ...(kind === 'scale' ? { replicas: over.replicas ?? 2 } : {}),
    },
    approval: {
      tokenId: over.tokenId ?? 'tok-1',
      actionId,
      incidentId: 'inc-1',
      approvedBy: over.approvedBy ?? APPROVER,
      issuedAt: iso(issued),
      expiresAt: iso(issued + (over.ttlMs ?? 15 * 60_000)),
    },
    context: { signals: over.signals ?? ['oom_killed'], confidence: over.confidence ?? 0.9 },
  };
};
export const signed = (over: Parameters<typeof unsigned>[0] = {}): ActionRequest =>
  signRequest(unsigned(over), SECRET);
