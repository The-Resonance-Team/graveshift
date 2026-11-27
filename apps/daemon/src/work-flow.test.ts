import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { FIX_PR_INTENT_AUDIT_TYPE } from './fix-audit';
import { setupFlow } from './flow.fixture';
import { agent, caller, pr } from './flow-fixtures';
import { createWorkCommands } from './work-flow';

describe.skipIf(!dbTestEnabled)('daemon Work orchestration', () => {
  const opened: Array<Awaited<ReturnType<typeof setupFlow>>> = [];
  const make = async (config: Parameters<typeof setupFlow>[0] = {}) => {
    const flow = await setupFlow(config);
    opened.push(flow);
    return flow;
  };
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((flow) => flow.close()));
  });

  test('Human triage persists and never launches routing or a fix', async () => {
    const flow = await make();
    const result = await flow.commands().triage(caller, 'work-1', { assignee: 'needs_human' });
    expect(result.autoFix).toBeNull();
    expect(result.item).toMatchObject({ assignee: 'needs_human' });
    expect(flow.calls).toContain('saveTriage');
    expect(flow.platform.models).toEqual([]);
    expect(flow.platform.recording.writes).toEqual([]);
    await expect(
      flow.commands().fixNow({ ...caller, commandId: 'fix-human' }, 'work-1', {}),
    ).rejects.toMatchObject({ code: 'MANUAL_ASSIGNMENT' });
  });

  test('the assigned Agent stays selected when another Agent matches the request', async () => {
    const flow = await make({
      agents: [agent(), agent({ name: 'Other Agent', slug: 'other-agent' })],
    });
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({
      ok: true,
      pr: { number: 8 },
      routing: { agent: { name: 'Assigned Agent' } },
    });
    expect(flow.platform.models).toHaveLength(1);
    expect(flow.platform.models[0]?.system).toContain('Assigned Agent instructions');
    expect(flow.platform.recording.writes.length).toBeGreaterThan(0);
    expect((await flow.platform.audit.list(caller.projectId)).map((entry) => entry.type)).toEqual([
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
  });

  test('Agent trigger config selects auto-fix and blocks the other trigger', async () => {
    const flow = await make({ agents: [agent({ autoFix: true })] });
    await expect(flow.commands().fixNow(caller, 'work-1', {})).rejects.toMatchObject({
      code: 'FIX_NOW_DISABLED',
    });
    const result = await flow
      .commands()
      .triage(caller, 'work-1', { assignee: 'needs_agent_Assigned Agent' });
    expect(result.autoFix).toMatchObject({ ok: true, failure: 'none' });
    expect(flow.calls.indexOf('saveTriage')).toBeLessThan(flow.calls.indexOf('claim'));
    const manual = await make();
    expect(
      (await manual.commands().triage(caller, 'work-1', { assignee: 'needs_agent_Assigned Agent' }))
        .autoFix,
    ).toBeNull();
    expect(manual.platform.models).toEqual([]);
  });

  test('two concurrent starts claim once before any source or model call', async () => {
    const flow = await make();
    const results = await Promise.allSettled([
      flow.commands().fixNow(caller, 'work-1', {}),
      flow.commands().fixNow({ ...caller, commandId: 'command-2' }, 'work-1', {}),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await flow.db.fixAttempt.count()).toBe(1);
    expect(flow.platform.models).toHaveLength(1);
    expect(flow.platform.recording.writes.length).toBeGreaterThan(0);
  });

  test('one saved question survives a new daemon instance and resumes the same attempt', async () => {
    const flow = await make({
      agents: [agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })],
    });
    const asked = await flow.commands().fixNow(caller, 'work-1', {});
    expect(asked.failure).toBe('awaiting_answer');
    expect((await flow.read()).activeAttempt?.state).toBe('awaiting_answer');
    expect(flow.calls).toContain('saveQuestion');
    if (asked.routing?.kind !== 'ask' || asked.attemptId === null)
      throw new Error('Expected question');
    const body = {
      attemptId: asked.attemptId,
      questionId: asked.routing.questionId,
      params: { VERSION: 'v2' },
    };
    const answeredBy = { ...caller, commandId: 'answer-1' };
    const restarted = createWorkCommands(flow.options);
    const completed = await restarted.answer(answeredBy, 'work-1', body);
    expect(completed).toMatchObject({ ok: true, attemptId: asked.attemptId, pr: { number: 8 } });
    expect(await restarted.answer(answeredBy, 'work-1', body)).toEqual(completed);
    expect(flow.platform.models).toHaveLength(2);
    expect(flow.calls.filter((call) => call === 'saveQuestion')).toHaveLength(1);
  });

  test('an incomplete answer hands the same attempt to a person without another question', async () => {
    const flow = await make({
      agents: [agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })],
    });
    const asked = await flow.commands().fixNow(caller, 'work-1', {});
    if (asked.routing?.kind !== 'ask' || asked.attemptId === null)
      throw new Error('Expected question');
    const result = await flow.commands().answer({ ...caller, commandId: 'answer-1' }, 'work-1', {
      attemptId: asked.attemptId,
      questionId: asked.routing.questionId,
      params: {},
    });
    expect(result).toMatchObject({ failure: 'needs_human', item: { assignee: 'needs_human' } });
    expect(flow.platform.models).toHaveLength(1);
    expect(flow.calls.filter((call) => call === 'saveQuestion')).toHaveLength(1);
  });

  test('policy denial prevents source, routing models, patch models, and publication', async () => {
    const flow = await make({
      agents: [agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })],
    });
    flow.options.policy = { ...flow.options.policy, rules: [] };
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ failure: 'policy_denied', effect: 'deny' });
    expect(flow.platform.models).toEqual([]);
    expect(flow.platform.recording.writes).toEqual([]);
  });

  test('missing context stops before every model and privileged effect', async () => {
    const flow = await make();
    flow.options.context = async () => {
      throw new Error('Facts unavailable');
    };
    expect((await flow.commands().fixNow(caller, 'work-1', {})).failure).toBe(
      'context_unavailable',
    );
    expect(flow.platform.models).toEqual([]);
    expect(flow.platform.recording.writes).toEqual([]);
  });

  test('a gateway audit failure withholds the patch and prevents publication', async () => {
    const flow = await make();
    const append = flow.platform.audit.append.bind(flow.platform.audit);
    const failure = spyOn(flow.platform.audit, 'append').mockImplementation(
      async (projectId, draft) => {
        if (draft.type === 'model.call') throw new Error('Required audit is unavailable');
        return append(projectId, draft);
      },
    );
    try {
      const result = await flow.commands().fixNow(caller, 'work-1', {});
      expect(result.failure).toBe('audit_failed');
      expect(flow.platform.recording.writes).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });

  test('failed auto-fix retains the committed Agent triage', async () => {
    const flow = await make({ agents: [agent({ autoFix: true })] });
    flow.options.context = async () => {
      throw new Error('Context unavailable');
    };
    const result = await flow
      .commands()
      .triage(caller, 'work-1', { assignee: 'needs_agent_Assigned Agent' });
    expect(result).toMatchObject({
      item: { assignee: 'needs_agent_Assigned Agent' },
      autoFix: { ok: false, failure: 'context_unavailable' },
    });
    expect((await flow.read()).item.assignee).toBe('needs_agent_Assigned Agent');
  });

  test('Fix now waits until publication has completed', async () => {
    const flow = await make();
    const publication = Promise.withResolvers<typeof pr>();
    const entered = Promise.withResolvers<void>();
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: () => {
        entered.resolve();
        return publication.promise;
      },
      dispose: async () => {},
    });
    let returned = false;
    const result = flow
      .commands()
      .fixNow(caller, 'work-1', {})
      .then((value) => {
        returned = true;
        return value;
      });
    await entered.promise;
    expect(returned).toBe(false);
    publication.resolve(pr);
    expect(await result).toMatchObject({ ok: true, pr });
  });

  test('a known draft survives a later durable-state failure', async () => {
    const flow = await make();
    flow.options.runtime.finish = async () => {
      throw new Error('State storage failed');
    };
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ failure: 'publication_uncertain', pr: { number: 8 } });
    expect((await flow.read()).item.draftPr?.number).toBe(8);
    await expect(
      flow.commands().fixNow({ ...caller, commandId: 'retry' }, 'work-1', {}),
    ).rejects.toMatchObject({ code: 'ALREADY_FIXED' });
  });
});
