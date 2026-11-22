import { describe, expect, test } from 'bun:test';

import { agent, caller, pr } from './flow-fixtures';
import { harness } from './flow-harness';
import { createWorkCommands } from './work-flow';

describe('daemon Work orchestration', () => {
  test('Human triage persists and never launches routing or a fix', async () => {
    const flow = harness();
    const result = await flow.commands().triage(caller, 'work-1', { assignee: 'needs_human' });
    expect(result.autoFix).toBeNull();
    expect(result.item).toMatchObject({ assignee: 'needs_human' });
    expect(flow.runtime.calls).toContain('saveTriage');
    expect(flow.effects).toEqual([]);
    await expect(
      flow.commands().fixNow({ ...caller, commandId: 'fix-human' }, 'work-1', {}),
    ).rejects.toMatchObject({ code: 'MANUAL_ASSIGNMENT' });
  });

  test('the assigned Agent stays selected when another Agent matches the request', async () => {
    const flow = harness([agent(), agent({ name: 'Other Agent', slug: 'other-agent' })]);
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ ok: true, pr, routing: { agent: { name: 'Assigned Agent' } } });
    expect(flow.requests).toEqual(['Assigned Agent']);
    expect(flow.effects).toEqual(['context', 'source:Assigned Agent', 'publish', 'dispose']);
    expect(flow.audit.map((entry) => entry.type)).toEqual([
      'policy.decision',
      'model.call',
      'fix.verified',
    ]);
  });

  test('Agent trigger config selects auto-fix and blocks the other trigger', async () => {
    const flow = harness([agent({ autoFix: true })]);
    await expect(flow.commands().fixNow(caller, 'work-1', {})).rejects.toMatchObject({
      code: 'FIX_NOW_DISABLED',
    });
    const result = await flow
      .commands()
      .triage(caller, 'work-1', { assignee: 'needs_agent_Assigned Agent' });
    expect(result.autoFix).toMatchObject({ ok: true, failure: 'none' });
    expect(flow.runtime.calls.indexOf('saveTriage')).toBeLessThan(
      flow.runtime.calls.indexOf('claim'),
    );
    const manual = harness();
    const waiting = await manual
      .commands()
      .triage(caller, 'work-1', { assignee: 'needs_agent_Assigned Agent' });
    expect(waiting.autoFix).toBeNull();
    expect(manual.requests).toEqual([]);
  });

  test('two concurrent starts claim once before any source or model call', async () => {
    const flow = harness();
    const results = await Promise.allSettled([
      flow.commands().fixNow(caller, 'work-1', {}),
      flow.commands().fixNow({ ...caller, commandId: 'command-2' }, 'work-1', {}),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(flow.runtime.calls.filter((call) => call === 'claim')).toHaveLength(1);
    expect(flow.requests).toHaveLength(1);
    expect(flow.effects.filter((effect) => effect === 'publish')).toHaveLength(1);
  });

  test('one saved question survives a new daemon instance and resumes the same attempt', async () => {
    const configured = agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] });
    const flow = harness([configured]);
    const asked = await flow.commands().fixNow(caller, 'work-1', {});
    expect(asked.failure).toBe('awaiting_answer');
    expect(flow.runtime.snapshot.activeAttempt?.state).toBe('awaiting_answer');
    expect(flow.runtime.calls).toContain('saveQuestion');
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
    expect(completed).toMatchObject({ ok: true, attemptId: asked.attemptId, pr });
    expect(await restarted.answer(answeredBy, 'work-1', body)).toEqual(completed);
    expect(flow.requests).toHaveLength(2);
    expect(flow.runtime.calls.filter((call) => call === 'saveQuestion')).toHaveLength(1);
  });

  test('an incomplete answer hands the same attempt to a person without another question', async () => {
    const flow = harness([agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })]);
    const asked = await flow.commands().fixNow(caller, 'work-1', {});
    if (asked.routing?.kind !== 'ask' || asked.attemptId === null)
      throw new Error('Expected question');
    const result = await flow.commands().answer({ ...caller, commandId: 'answer-1' }, 'work-1', {
      attemptId: asked.attemptId,
      questionId: asked.routing.questionId,
      params: {},
    });
    expect(result).toMatchObject({ failure: 'needs_human', item: { assignee: 'needs_human' } });
    expect(flow.requests).toHaveLength(1);
    expect(flow.effects).toEqual(['context']);
  });

  test('policy denial prevents source, routing models, patch models, and publication', async () => {
    const flow = harness([agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })]);
    flow.options.policy = { ...flow.options.policy, rules: [] };
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ failure: 'policy_denied', effect: 'deny' });
    expect(flow.effects).toEqual(['context']);
    expect(flow.requests).toEqual([]);
  });

  test('missing context stops before every model and privileged effect', async () => {
    const flow = harness();
    flow.options.context = async () => {
      throw new Error('Facts unavailable');
    };
    expect((await flow.commands().fixNow(caller, 'work-1', {})).failure).toBe(
      'context_unavailable',
    );
    expect(flow.requests).toEqual([]);
    expect(flow.effects).toEqual([]);
  });

  test('a gateway audit failure withholds the patch and prevents publication', async () => {
    const flow = harness();
    flow.failAudit();
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result.failure).toBe('audit_failed');
    expect(flow.requests).toHaveLength(1);
    expect(flow.effects).not.toContain('publish');
  });

  test('failed auto-fix retains the committed Agent triage', async () => {
    const flow = harness([agent({ autoFix: true })]);
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
    expect(flow.runtime.snapshot.item.assignee).toBe('needs_agent_Assigned Agent');
  });

  test('Fix now waits until publication has completed', async () => {
    const flow = harness();
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
    const flow = harness();
    flow.runtime.failFinish = true;
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ pr, failure: 'publication_uncertain', item: { draftPr: pr } });
    expect(flow.effects.filter((effect) => effect === 'publish')).toHaveLength(1);
    await expect(
      flow.commands().fixNow({ ...caller, commandId: 'retry' }, 'work-1', {}),
    ).rejects.toMatchObject({ code: 'ALREADY_FIXED' });
  });
});
