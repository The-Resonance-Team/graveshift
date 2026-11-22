import { describe, expect, test } from 'bun:test';
import * as actuator from '@graveshift/actuator';

import { dbTestEnabled, openTestDatabase } from '../../test/database/fixtures';
import { AuditRepo } from '../audit/audit.repo';
import type { ActionRepo } from './action.repo';
import { actionRepo, setupActionsDatabase } from './testing/action-db.fixture';
import { ACTION_TEST_POLICY } from './testing/action.fixture';

function runtime(repo: ActionRepo, audit: AuditRepo, complete = true) {
  const calls: string[] = [];
  const executor = actuator.createActuator({
    secret: 'fixture-signing-secret-32-characters',
    namespace: 'fixture',
    policy: ACTION_TEST_POLICY,
    docker: { restart: async (service) => void calls.push(`docker:${service}`) },
    kube: {
      rolloutRestart: async (namespace, service) => void calls.push(`k8s:${namespace}/${service}`),
      scale: async (namespace, service, replicas) =>
        void calls.push(`scale:${namespace}/${service}:${replicas}`),
    },
    requiredAudit: async (draft) => {
      await audit.append('project-1', draft);
      return { key: draft.key };
    },
    durableAdmission: {
      claim: (claim) => repo.claim({ projectId: 'project-1', claim }),
      complete: (completion) => {
        if (!complete) return Promise.reject(new Error('The process stopped before completion'));
        return repo.complete({ projectId: 'project-1', completion });
      },
    },
  });
  return { executor, calls };
}

describe.skipIf(!dbTestEnabled)('runtime executor with durable API claims', () => {
  const fixture = setupActionsDatabase();

  test('recreated API and actuator clients cannot repeat a completed runtime effect', async () => {
    const input = await fixture.input();
    let client = await openTestDatabase();
    try {
      const first = runtime(actionRepo(client), new AuditRepo(client));
      expect((await first.executor.execute(input.claim.request)).status).toBe('executed');
      await client.onModuleDestroy();
      client = await openTestDatabase();
      const restarted = runtime(actionRepo(client), new AuditRepo(client));
      expect(await restarted.executor.execute(input.claim.request)).toMatchObject({
        status: 'denied',
        reason: 'already_completed',
        knownResult: { status: 'executed', reason: 'executed' },
      });
      expect(first.calls).toEqual(['k8s:fixture/api']);
      expect(restarted.calls).toEqual([]);
      expect(await fixture.db.actionClaim.count()).toBe(1);
    } finally {
      await client.onModuleDestroy();
    }
  });

  test('a runtime effect without a terminal completion remains uncertain after recreation', async () => {
    const input = await fixture.input();
    const first = runtime(fixture.repo, fixture.audit, false);
    expect(await first.executor.execute(input.claim.request)).toMatchObject({
      status: 'executed',
      auditStatus: 'pending',
    });
    const client = await openTestDatabase();
    try {
      const restarted = runtime(actionRepo(client), new AuditRepo(client));
      expect(await restarted.executor.execute(input.claim.request)).toMatchObject({
        status: 'denied',
        reason: 'execution_uncertain',
      });
      expect(first.calls).toEqual(['k8s:fixture/api']);
      expect(restarted.calls).toEqual([]);
      expect((await fixture.db.actionClaim.findFirstOrThrow()).state).toBe('admitted');
    } finally {
      await client.onModuleDestroy();
    }
  });

  test('two executors with separate clients cannot exceed the persisted Grave limit', async () => {
    const client = await openTestDatabase();
    try {
      const first = runtime(fixture.repo, fixture.audit);
      const second = runtime(actionRepo(client), new AuditRepo(client));
      const firstInput = await fixture.input('first');
      const secondInput = await fixture.input('second');
      const results = await Promise.all([
        first.executor.execute(firstInput.claim.request),
        second.executor.execute(secondInput.claim.request),
      ]);
      expect(results.filter((result) => result.status === 'executed')).toHaveLength(1);
      expect(results.some((result) => result.reason === 'policy_rate_limited')).toBe(true);
      expect([...first.calls, ...second.calls]).toEqual(['k8s:fixture/api']);
      expect(await fixture.db.actionClaim.count()).toBe(1);
      expect(await fixture.audit.verifyChain('project-1')).toEqual({ ok: true, length: 3 });
    } finally {
      await client.onModuleDestroy();
    }
  });
});
