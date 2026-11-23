import { WorkError } from '@graveshift/work';
import { describe, expect, test } from 'bun:test';

import { agent, caller, item } from './flow-fixtures';
import { harness } from './flow-harness';
import { workActivation } from './work-activation';

describe('created Work item activation', () => {
  test('starts the configured automatic trigger once and replays on delivery retry', async () => {
    const flow = harness([agent({ autoFix: true })]);
    const created = item();
    const activate = workActivation(flow.commands(), caller.projectId);
    await activate(created, 'incident-1');
    await activate(created, 'incident-1');
    expect(flow.runtime.snapshot.item.draftPr?.number).toBe(7);
    expect(flow.runtime.calls.filter((call) => call === 'claim')).toHaveLength(1);
    expect(flow.effects.filter((effect) => effect === 'publish')).toHaveLength(1);
    const activation = [...flow.runtime.receipts.values()][0]?.caller;
    expect(activation).toMatchObject({
      projectId: caller.projectId,
      actor: 'wraith',
      expectedVersion: 0,
    });
    expect(activation?.commandId.length).toBeLessThanOrEqual(100);
    expect(flow.requests).toEqual(['Assigned Agent']);
  });

  test.each(['needs_human', 'needs_agent_Assigned Agent'])(
    'saves %s without a model call when no automatic trigger is configured',
    async (assignee) => {
      const flow = harness();
      flow.runtime.snapshot.item = item({ assignee });
      await workActivation(flow.commands(), caller.projectId)(item({ assignee }), 'incident-1');
      expect(flow.runtime.snapshot.item.assignee).toBe(assignee);
      expect(flow.runtime.snapshot.version).toBe(1);
      expect(flow.runtime.calls).toContain('saveTriage');
      expect(flow.effects).toEqual([]);
      expect(flow.requests).toEqual([]);
    },
  );

  test('a person can change the assignment between creation and activation', async () => {
    const flow = harness([agent({ autoFix: true })]);
    const created = structuredClone(flow.runtime.snapshot.item);
    await flow.commands().triage(caller, 'work-1', { assignee: 'needs_human' });
    await workActivation(flow.commands(), caller.projectId)(created, 'incident-1');
    expect(flow.runtime.snapshot.item.assignee).toBe('needs_human');
    expect(flow.runtime.snapshot.version).toBe(1);
    expect(flow.runtime.calls.filter((call) => call === 'claim')).toEqual([]);
    expect(flow.effects).toEqual([]);
  });

  test('the authoritative save rejects a person change after the daemon reads version zero', async () => {
    const flow = harness([agent({ autoFix: true })]);
    const save = flow.runtime.saveTriage.bind(flow.runtime);
    flow.runtime.saveTriage = async (activation, id, input) => {
      flow.runtime.snapshot.item = item({ assignee: 'needs_human' });
      flow.runtime.snapshot.version++;
      return save(activation, id, input);
    };
    await workActivation(flow.commands(), caller.projectId)(item(), 'incident-1');
    expect(flow.runtime.snapshot.item.assignee).toBe('needs_human');
    expect(flow.runtime.receipts.size).toBe(0);
    expect(flow.requests).toEqual([]);
  });

  test('replays a saved triage after a lost response and claims only its recorded version', async () => {
    const flow = harness([agent({ autoFix: true })]);
    const save = flow.runtime.saveTriage.bind(flow.runtime);
    let lose = true;
    flow.runtime.saveTriage = async (...args) => {
      const result = await save(...args);
      if (lose) {
        lose = false;
        throw new Error('Triage response was lost');
      }
      return result;
    };
    const activate = workActivation(flow.commands(), caller.projectId);
    await expect(activate(item(), 'incident-1')).rejects.toThrow('response was lost');
    expect(flow.runtime.snapshot.version).toBe(1);
    await activate(item(), 'incident-1');
    expect(flow.runtime.snapshot.item.draftPr?.number).toBe(7);
    expect(flow.runtime.calls.filter((call) => call === 'saveTriage')).toHaveLength(1);
    expect(flow.runtime.calls.filter((call) => call === 'claim')).toHaveLength(1);
  });

  test('a newer assignment prevents an old saved activation from claiming after restart', async () => {
    const flow = harness([agent({ autoFix: true })]);
    const save = flow.runtime.saveTriage.bind(flow.runtime);
    let lose = true;
    flow.runtime.saveTriage = async (...args) => {
      const result = await save(...args);
      if (lose) {
        lose = false;
        throw new Error('Triage response was lost');
      }
      return result;
    };
    await expect(
      workActivation(flow.commands(), caller.projectId)(item(), 'incident-1'),
    ).rejects.toThrow();
    await flow.commands().triage(caller, 'work-1', { assignee: 'needs_human' });
    await workActivation(flow.commands(), caller.projectId)(item(), 'incident-1');
    expect(flow.runtime.snapshot.item.assignee).toBe('needs_human');
    expect(flow.runtime.snapshot.version).toBe(2);
    expect(flow.requests).toEqual([]);
  });

  test('returns only after the automatic attempt has saved its one question', async () => {
    const flow = harness([
      agent({ autoFix: true, prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] }),
    ]);
    const activate = workActivation(flow.commands(), caller.projectId);
    await activate(item(), 'incident-1');
    expect(flow.runtime.snapshot.activeAttempt).toMatchObject({
      state: 'awaiting_answer',
      trigger: 'auto_fix',
      questionId: 'attempt-1:question',
    });
    await activate(item(), 'incident-1');
    expect(flow.requests).toHaveLength(1);
    expect(flow.runtime.calls.filter((call) => call === 'saveQuestion')).toHaveLength(1);
  });

  test('propagates unavailable state so the queue can retry activation', async () => {
    const flow = harness();
    flow.runtime.read = async () => {
      throw new WorkError('WORK_NOT_FOUND', 'Unavailable Work item');
    };
    await expect(
      workActivation(flow.commands(), caller.projectId)(item(), 'incident-1'),
    ).rejects.toMatchObject({ code: 'WORK_NOT_FOUND' });
  });
});
