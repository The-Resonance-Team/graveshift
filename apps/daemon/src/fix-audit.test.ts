import { describe, expect, test } from 'bun:test';

import { currentAuditScope, withAuditScope } from './audit';
import { FIX_PR_INTENT_AUDIT_TYPE, auditScopeOfCaller, fixPrIntentAudit } from './fix-audit';
import { caller } from './flow-fixtures';
import { harness } from './flow-harness';
import { runFix } from './run-fix';

const SECRET = 'ghp_16C7e6F4a2B9d3E8c5A1';

const worker = { ...caller, workerId: 'worker-1' };

async function claim(flow: ReturnType<typeof harness>) {
  const claimed = await flow.runtime.claim(worker, 'work-1', {
    expectedVersion: 0,
    command: { kind: 'fix_now', body: {} },
  });
  if (claimed.kind !== 'claimed') throw new Error('Expected claim');
  return claimed;
}

describe('fix audit scope', () => {
  test('an attempt with no authenticated audit scope is denied before any model or GitHub call', async () => {
    const flow = harness();
    const started = await claim(flow);
    // No `withAuditScope` around the call: the attempt has no chain to write to.
    const result = await runFix(flow.options, worker, started);
    expect(result).toMatchObject({ ok: false, failure: 'audit_failed' });
    expect(flow.requests).toEqual([]);
    expect(flow.effects).toEqual([]);
    expect(flow.audit).toEqual([]);
    expect(currentAuditScope()).toBeUndefined();
  });

  test('a blank authenticated scope is refused as though it were absent', async () => {
    const flow = harness();
    const started = await claim(flow);
    const blank = await withAuditScope({ projectId: ' ', actor: 'person-1' }, () =>
      runFix(flow.options, worker, started),
    );
    expect(blank).toMatchObject({ ok: false, failure: 'audit_failed' });
    expect(flow.requests).toEqual([]);
    expect(flow.effects).toEqual([]);
  });

  test('the pre-side-effect entry is appended before the draft pull request call', async () => {
    const flow = harness();
    const result = await flow.commands().fixNow(caller, 'work-1', { note: `secret ${SECRET}` });
    expect(result).toMatchObject({ ok: true });
    // One ordered record of both kinds of side effect: the audit append precedes the write.
    expect(flow.events).toEqual([
      'context',
      'audit:policy.decision',
      'source:Assigned Agent',
      'audit:model.call',
      `audit:${FIX_PR_INTENT_AUDIT_TYPE}`,
      'publish',
      'dispose',
    ]);
    expect(flow.audit.map((entry) => entry.type)).toEqual([
      'policy.decision',
      'model.call',
      FIX_PR_INTENT_AUDIT_TYPE,
    ]);
  });

  test('a failed intent append stops the attempt before the draft pull request call', async () => {
    const flow = harness();
    flow.failAuditOf(FIX_PR_INTENT_AUDIT_TYPE);
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ ok: false, failure: 'audit_failed' });
    expect(flow.effects).not.toContain('publish');
    expect(flow.events).not.toContain('publish');
  });

  test('every fix entry is keyed by the authenticated caller and holds no request text', async () => {
    const flow = harness();
    await flow.commands().fixNow(caller, 'work-1', { note: `rotate the token ${SECRET}` });
    const fix = flow.audit.filter((entry) => entry.type === FIX_PR_INTENT_AUDIT_TYPE);
    expect(fix).toHaveLength(1);
    expect(fix[0]).toMatchObject({
      projectId: caller.projectId,
      actor: caller.actor,
      type: FIX_PR_INTENT_AUDIT_TYPE,
      payload: { workItemId: 'work-1', trigger: 'fix_now', agent: 'Assigned Agent' },
    });
    expect(JSON.stringify(flow.audit)).not.toContain(SECRET);
    expect(JSON.stringify(flow.audit)).not.toContain('note');
  });

  test('the intent entry records the publication target and no branch slug or URL', async () => {
    const flow = harness();
    await flow.commands().fixNow(caller, 'work-1', {});
    const intent = flow.audit.find((entry) => entry.type === FIX_PR_INTENT_AUDIT_TYPE);
    if (intent === undefined) throw new Error('Expected the intent entry');
    expect(Object.keys(intent.payload).sort()).toEqual([
      'agent',
      'attemptId',
      'baseSha',
      'repo',
      'service',
      'stage',
      'trigger',
      'workItemId',
    ]);
    expect(JSON.stringify(intent)).not.toContain('refs/heads/');
    expect(JSON.stringify(intent)).not.toContain('github.com');
  });
});

describe('fix audit builders', () => {
  const identity = {
    ...auditScopeOfCaller(caller),
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    attemptVersion: 1,
    trigger: 'fix_now' as const,
    agent: 'Assigned Agent',
    service: 'checkout',
  };

  test('the scope of a command is its authenticated project and client', () => {
    expect(auditScopeOfCaller({ ...caller, workerId: 'worker-1' })).toEqual({
      projectId: 'project-1',
      actor: 'person-1',
    });
  });

  test('an intent with a secret in the title or note stays out of the payload', () => {
    const draft = fixPrIntentAudit(
      { ...identity, agent: `agent ${SECRET}` },
      { repo: 'team/grave', branch: `fix/${SECRET}`, baseSha: 'base-1' },
    );
    expect(draft.payload).toEqual({
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      trigger: 'fix_now',
      agent: `agent ${SECRET}`,
      service: 'checkout',
      stage: 'draft_pr',
      repo: 'team/grave',
      baseSha: 'base-1',
    });
    expect(JSON.stringify(draft.payload)).not.toContain(`fix/${SECRET}`);
  });
});
