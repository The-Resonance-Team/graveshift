import { afterEach, describe, expect, test } from 'bun:test';
import { WorkError } from '@graveshift/work';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { setupFlow } from './flow.fixture';
import { agent, caller, item } from './flow-fixtures';
import { workActivation } from './work-activation';

describe.skipIf(!dbTestEnabled)('created Work item activation', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  const automatic = () => setupFlow({ agents: [agent({ autoFix: true })] });
  afterEach(async () => {
    await flow?.close();
  });

  test('starts the configured automatic trigger once and replays on delivery retry', async () => {
    flow = await automatic();
    const activate = workActivation(flow.commands(), caller.projectId);
    await activate(item(), 'incident-1');
    await activate(item(), 'incident-1');
    expect(await flow.db.workItem.findFirstOrThrow()).toMatchObject({
      draftPr: { number: 8 },
    });
    expect(flow.calls.filter((call) => call === 'claim')).toHaveLength(1);
    expect(flow.platform.models).toHaveLength(1);
    const activation = await flow.db.workCommand.findFirstOrThrow();
    expect(activation).toMatchObject({ projectId: caller.projectId, actor: 'wraith' });
    expect(activation.commandId.length).toBeLessThanOrEqual(100);
  });

  test.each(['needs_human', 'needs_agent_Assigned Agent'])(
    'saves %s without a model call when no automatic trigger is configured',
    async (assignee) => {
      flow = await setupFlow({ seed: assignee });
      await workActivation(flow.commands(), caller.projectId)(item({ assignee }), 'incident-1');
      expect(await flow.db.workItem.findFirstOrThrow()).toMatchObject({ assignee });
      expect(flow.calls).toContain('saveTriage');
      expect(flow.platform.models).toEqual([]);
      expect(flow.platform.recording.writes).toEqual([]);
    },
  );

  test('a person can change the assignment between creation and activation', async () => {
    flow = await automatic();
    const created = item();
    await flow.commands().triage(caller, 'work-1', { assignee: 'needs_human' });
    await workActivation(flow.commands(), caller.projectId)(created, 'incident-1');
    expect(await flow.db.workItem.findFirstOrThrow()).toMatchObject({ assignee: 'needs_human' });
    expect(flow.calls.filter((call) => call === 'claim')).toEqual([]);
    expect(flow.platform.models).toEqual([]);
  });

  test('the authoritative save rejects a person change after the daemon reads version zero', async () => {
    flow = await automatic();
    const save = flow.options.runtime.saveTriage.bind(flow.options.runtime);
    flow.options.runtime.saveTriage = async (...args) => {
      await flow.db.workItem.update({
        where: { id: 'work-1' },
        data: { assignee: 'needs_human', version: { increment: 1 } },
      });
      return save(...args);
    };
    await workActivation(flow.commands(), caller.projectId)(item(), 'incident-1');
    expect(await flow.db.workItem.findFirstOrThrow()).toMatchObject({ assignee: 'needs_human' });
    expect(await flow.db.workCommand.count()).toBe(0);
    expect(flow.platform.models).toEqual([]);
  });

  test('replays a saved triage after a lost response and claims only its recorded version', async () => {
    flow = await automatic();
    const save = flow.options.runtime.saveTriage.bind(flow.options.runtime);
    let lose = true;
    flow.options.runtime.saveTriage = async (...args) => {
      const result = await save(...args);
      if (lose) {
        lose = false;
        throw new Error('Triage response was lost');
      }
      return result;
    };
    const activate = workActivation(flow.commands(), caller.projectId);
    await expect(activate(item(), 'incident-1')).rejects.toThrow('response was lost');
    await activate(item(), 'incident-1');
    expect(await flow.db.workItem.findFirstOrThrow()).toMatchObject({ draftPr: { number: 8 } });
    expect(flow.calls).toContain('replay');
    expect(flow.calls.filter((call) => call === 'claim')).toHaveLength(1);
  });

  test('a newer assignment prevents an old saved activation from claiming after restart', async () => {
    flow = await automatic();
    const save = flow.options.runtime.saveTriage.bind(flow.options.runtime);
    let lose = true;
    flow.options.runtime.saveTriage = async (...args) => {
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
    expect(await flow.db.workItem.findFirstOrThrow()).toMatchObject({ assignee: 'needs_human' });
    expect(flow.platform.models).toEqual([]);
  });

  test('returns only after the automatic attempt has saved its one question', async () => {
    flow = await setupFlow({
      agents: [agent({ autoFix: true, prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })],
    });
    const activate = workActivation(flow.commands(), caller.projectId);
    await activate(item(), 'incident-1');
    await activate(item(), 'incident-1');
    expect((await flow.read()).activeAttempt).toMatchObject({
      state: 'awaiting_answer',
      trigger: 'auto_fix',
    });
    expect(flow.platform.models).toHaveLength(1);
    expect(flow.calls.filter((call) => call === 'saveQuestion')).toHaveLength(1);
  });

  test('propagates unavailable state so the queue can retry activation', async () => {
    flow = await setupFlow();
    flow.options.runtime.read = async () => {
      throw new WorkError('WORK_NOT_FOUND', 'Unavailable Work item');
    };
    await expect(
      workActivation(flow.commands(), caller.projectId)(item(), 'incident-1'),
    ).rejects.toMatchObject({ code: 'WORK_NOT_FOUND' });
  });
});
