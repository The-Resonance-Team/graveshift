import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { currentAuditScope, withAuditScope } from './audit';
import { FIX_PR_INTENT_AUDIT_TYPE, auditScopeOfCaller, fixPrIntentAudit } from './fix-audit';
import { setupFlow } from './flow.fixture';
import { caller } from './flow-fixtures';
import { runFix } from './run-fix';

const SECRET = 'fake-ghp-token';
const worker = { ...caller, workerId: 'worker-1' };

describe.skipIf(!dbTestEnabled)('fix audit scope', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  beforeEach(async () => {
    flow = await setupFlow();
  });
  afterEach(async () => {
    await flow?.close();
  });
  const claim = async () => {
    const snapshot = await flow.read();
    const started = await flow.options.runtime.claim(worker, 'work-1', {
      expectedVersion: snapshot.version,
      command: { kind: 'fix_now', body: {} },
    });
    if (started.kind !== 'claimed') throw new Error('Expected claim');
    return started;
  };

  test('an attempt with no authenticated audit scope is denied before any model or GitHub call', async () => {
    const started = await claim();
    // No `withAuditScope` around the call: the attempt has no chain to write to.
    const result = await runFix(flow.options, worker, started);
    expect(result).toMatchObject({ ok: false, failure: 'audit_failed' });
    expect(flow.platform.models).toEqual([]);
    expect(flow.platform.recording.writes).toEqual([]);
    expect(await flow.db.auditEntry.findMany({ where: { type: 'model.call' } })).toEqual([]);
    expect(currentAuditScope()).toBeUndefined();
  });

  test('a blank authenticated scope is refused as though it were absent', async () => {
    const started = await claim();
    const blank = await withAuditScope({ projectId: ' ', actor: 'person-1' }, () =>
      runFix(flow.options, worker, started),
    );
    expect(blank).toMatchObject({ ok: false, failure: 'audit_failed' });
    expect(flow.platform.models).toEqual([]);
    expect(flow.platform.recording.writes).toEqual([]);
  });

  test('the pre-side-effect entry is appended before the draft pull request call', async () => {
    const result = await flow.commands().fixNow(caller, 'work-1', { note: `secret ${SECRET}` });
    expect(result).toMatchObject({ ok: true });
    const entries = await flow.platform.audit.list(caller.projectId);
    expect(entries.map((entry) => entry.type)).toEqual([
      'haunting.recorded',
      'work.claimed',
      'policy.decision',
      'fix.base_sha',
      'model.call',
      FIX_PR_INTENT_AUDIT_TYPE,
      'work.publication_started',
      'work.publication_recorded',
      'work.finished',
    ]);
    expect(flow.platform.recording.writes.length).toBeGreaterThan(0);
  });

  test('a failed intent append stops the attempt before the draft pull request call', async () => {
    const append = flow.platform.audit.append.bind(flow.platform.audit);
    const failure = spyOn(flow.platform.audit, 'append').mockImplementation(
      async (projectId, draft) => {
        if (draft.type === FIX_PR_INTENT_AUDIT_TYPE) throw new Error('Durable audit unavailable');
        return append(projectId, draft);
      },
    );
    try {
      const result = await flow.commands().fixNow(caller, 'work-1', {});
      expect(result).toMatchObject({ ok: false, failure: 'audit_failed' });
      expect(flow.platform.recording.writes).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });

  test('every fix entry is keyed by the authenticated caller and holds no request text', async () => {
    await flow.commands().fixNow(caller, 'work-1', { note: `rotate the token ${SECRET}` });
    const fix = (await flow.platform.audit.list(caller.projectId)).filter(
      (entry) => entry.type === FIX_PR_INTENT_AUDIT_TYPE,
    );
    expect(fix).toHaveLength(1);
    expect(fix[0]).toMatchObject({
      actor: caller.actor,
      type: FIX_PR_INTENT_AUDIT_TYPE,
      payload: { workItemId: 'work-1', trigger: 'fix_now', agent: 'Assigned Agent' },
    });
    expect(JSON.stringify(await flow.platform.audit.list(caller.projectId))).not.toContain(SECRET);
    expect(JSON.stringify(await flow.platform.audit.list(caller.projectId))).not.toContain('note');
  });

  test('the intent entry records the publication target and no branch slug or URL', async () => {
    await flow.commands().fixNow(caller, 'work-1', {});
    const intent = (await flow.platform.audit.list(caller.projectId)).find(
      (entry) => entry.type === FIX_PR_INTENT_AUDIT_TYPE,
    );
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
