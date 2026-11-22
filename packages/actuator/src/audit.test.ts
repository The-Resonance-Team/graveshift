import { expect, test } from 'bun:test';
import * as core from '@graveshift/core';

import { setup, signed, T0 } from './test-helpers';

test('one admission ACK precedes the effect and one distinct terminal handoff follows it', async () => {
  const trace: string[] = [];
  const audits: core.AuditDraft[] = [];
  const { actuator } = setup(T0, {
    requiredAudit: async (draft) => {
      audits.push(draft);
      trace.push(draft.type);
      return { key: draft.key };
    },
    kube: {
      rolloutRestart: async () => void trace.push('runtime'),
      scale: async () => {},
    },
  });
  const result = await actuator.execute(signed());
  expect(trace).toEqual(['actuator.admitted', 'runtime', 'actuator.executed']);
  expect(result.auditStatus).toBe('acknowledged');
  expect(audits).toHaveLength(2);
  expect(audits[0]?.key).not.toBe(audits[1]?.key);
  expect(audits.every((draft) => core.AuditDraftSchema.safeParse(draft).success)).toBe(true);
  expect(audits[1]).toEqual(result.audit);
  const other = setup();
  await other.actuator.execute(signed());
  expect(audits.map((draft) => draft.key)).toEqual(other.audits.map((draft) => draft.key));
});

test('a local audit sink reports pending instead of acknowledged', async () => {
  const { actuator } = setup(T0, { durableAudit: false });
  const result = await actuator.execute(signed());
  expect(result.status).toBe('executed');
  expect(result.auditStatus).toBe('pending');
});

test('audit failure before admission runs no effect and releases its token and capacity', async () => {
  let unavailable = true;
  const audits: core.AuditDraft[] = [];
  const { actuator, calls } = setup(T0, {
    maxTrackedActions: 1,
    requiredAudit: async (draft) => {
      audits.push(draft);
      if (unavailable) throw new Error('Bearer private-audit-secret');
      return { key: draft.key };
    },
  });
  const first = await actuator.execute(signed());
  expect(first).toMatchObject({
    status: 'failed',
    reason: 'admission_unavailable',
    auditStatus: 'pending',
  });
  expect(calls).toEqual([]);
  expect(audits.map((draft) => draft.type)).toEqual(['actuator.admitted']);
  expect(JSON.stringify(first)).not.toContain('private-audit-secret');
  unavailable = false;
  expect((await actuator.execute(signed())).status).toBe('executed');
  expect(calls).toHaveLength(1);
  expect(audits[1]).toEqual(audits[0]);
});

test('an ACK for a different key cannot authorize the effect', async () => {
  const audits: core.AuditDraft[] = [];
  const { actuator, calls } = setup(T0, {
    requiredAudit: async (draft) => {
      audits.push(draft);
      return { key: 'different' };
    },
  });
  expect(await actuator.execute(signed())).toMatchObject({
    status: 'failed',
    reason: 'admission_unavailable',
  });
  expect(calls).toEqual([]);
  expect(audits).toHaveLength(1);
});

test('terminal audit failure retains the executed outcome without retrying either handoff or effect', async () => {
  const audits: core.AuditDraft[] = [];
  const { actuator, calls } = setup(T0, {
    requiredAudit: async (draft) => {
      audits.push(draft);
      if (draft.type !== 'actuator.admitted') throw new Error('Bearer private-audit-secret');
      return { key: draft.key };
    },
  });
  const result = await actuator.execute(signed());
  expect(result).toMatchObject({ status: 'executed', reason: 'executed', auditStatus: 'pending' });
  expect(calls).toHaveLength(1);
  expect(audits.map((draft) => draft.type)).toEqual(['actuator.admitted', 'actuator.executed']);
  expect((await actuator.execute(signed())).reason).toBe('replay');
  expect(calls).toHaveLength(1);
  expect(audits.filter((draft) => draft.type === 'actuator.executed')).toHaveLength(1);
  expect(JSON.stringify([result, audits])).not.toContain('private-audit-secret');
});

test('backend and terminal audit errors cannot escape through outcomes or audit payloads', async () => {
  const audits: core.AuditDraft[] = [];
  const attempts: string[] = [];
  const secret = 'Bearer raw-privileged-backend-secret';
  const { actuator } = setup(T0, {
    requiredAudit: async (draft) => {
      audits.push(draft);
      if (draft.type === 'actuator.failed') throw new Error(secret);
      return { key: draft.key };
    },
    kube: {
      rolloutRestart: async () => {
        attempts.push('runtime');
        throw new Error(secret);
      },
      scale: async () => {},
    },
  });
  const result = await actuator.execute(signed());
  expect(result).toMatchObject({
    status: 'failed',
    reason: 'execution_failed',
    auditStatus: 'pending',
  });
  expect(audits.map((draft) => draft.type)).toEqual(['actuator.admitted', 'actuator.failed']);
  expect(attempts).toEqual(['runtime']);
  expect(JSON.stringify([result, audits])).not.toContain(secret);
});

test('an audit dependency cannot mutate the admitted action or retained terminal result', async () => {
  const { actuator, calls } = setup(T0, {
    requiredAudit: async (draft) => {
      draft.payload.reason = 'Bearer mutated-audit-secret';
      return { key: draft.key };
    },
  });
  const result = await actuator.execute(signed());
  expect(result.audit.payload.reason).toBe('executed');
  expect(JSON.stringify(result)).not.toContain('mutated-audit-secret');
  expect(calls).toEqual(['k8s.restart:candy-shop/api']);
});
