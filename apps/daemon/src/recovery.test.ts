import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { FixExecutionError } from './execution';
import { setupFlow } from './flow.fixture';
import { caller, pr } from './flow-fixtures';
import { createWorkCommands } from './work-flow';

describe.skipIf(!dbTestEnabled)('publication recovery', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  beforeEach(async () => {
    flow = await setupFlow();
  });
  afterEach(async () => {
    await flow?.close();
  });

  const uncertain = (message = 'draft publication failed during draft') =>
    new FixExecutionError('publication_uncertain', message);

  test('replays an uncertain command through recovery without another model or publication', async () => {
    let publications = 0;
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        publications++;
        throw uncertain();
      },
      dispose: async () => {},
    });
    expect((await flow.commands().fixNow(caller, 'work-1', {})).failure).toBe(
      'publication_uncertain',
    );
    let recovered = 0;
    flow.options.recover = async (intent) => {
      recovered++;
      expect(intent.branch).toBe(pr.branch);
      return pr;
    };
    const result = await createWorkCommands(flow.options).fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ ok: true, pr });
    expect(recovered).toBe(1);
    expect(publications).toBe(1);
    expect(flow.platform.models).toHaveLength(0);
  });

  test('recovery does not publish when the remote draft is still unknown', async () => {
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        throw uncertain();
      },
      dispose: async () => {},
    });
    const first = await flow.commands().fixNow(caller, 'work-1', {});
    const result = await createWorkCommands(flow.options).fixNow(caller, 'work-1', {});
    expect(result).toEqual(first);
    expect((await flow.read()).activeAttempt?.state).toBe('uncertain');
    expect(flow.platform.recording.calls).toEqual(['recover']);
  });

  test('recovers a committed PR after the original completion response was lost', async () => {
    const finish = flow.options.runtime.finish.bind(flow.options.runtime);
    let lose = true;
    flow.options.runtime.finish = async (commandCaller, id, input) => {
      if (lose && input.state === 'completed') {
        lose = false;
        throw new Error('Completion response was lost');
      }
      return finish(commandCaller, id, input);
    };
    const first = await flow.commands().fixNow(caller, 'work-1', {});
    expect(first).toMatchObject({ failure: 'publication_uncertain', pr: { number: 8 } });
    expect(await flow.db.fixAttempt.findFirst()).toMatchObject({ state: 'uncertain' });
    const recovered = await createWorkCommands(flow.options).fixNow(caller, 'work-1', {});
    expect(recovered).toMatchObject({ ok: true, pr: first.pr });
    expect(flow.platform.models).toHaveLength(1);
  });

  test('retains a reference carried by a publication error', async () => {
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        throw new FixExecutionError('publication_uncertain', uncertain().message, pr);
      },
      dispose: async () => {},
    });
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ pr, item: { draftPr: pr }, failure: 'publication_uncertain' });
  });

  test('reconciles an admitted draft when the saved intent consumes the current publication limit', async () => {
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        throw uncertain();
      },
      dispose: async () => {},
    });
    await flow.commands().fixNow(caller, 'work-1', {});
    flow.options.policy = {
      ...flow.options.policy,
      limits: { ...flow.options.policy.limits, maxOpenPrsPerHour: 1 },
    };
    flow.options.context = async () => {
      throw new Error('No new policy admission is available');
    };
    flow.options.recover = async () => pr;
    const result = await createWorkCommands(flow.options).fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ ok: true, pr });
    expect(
      (await flow.platform.audit.list(caller.projectId)).some(
        (entry) => entry.type === 'fix.reconciliation',
      ),
    ).toBe(true);
  });

  test('each reconciliation read has its own durable audit key and never repeats publication', async () => {
    let published = 0;
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        published++;
        throw uncertain();
      },
      dispose: async () => {},
    });
    await flow.commands().fixNow(caller, 'work-1', {});
    const restarted = createWorkCommands(flow.options);
    await restarted.fixNow(caller, 'work-1', {});
    flow.options.recover = async () => pr;
    expect(await restarted.fixNow(caller, 'work-1', {})).toMatchObject({ ok: true, pr });
    const entries = await flow.platform.audit.list(caller.projectId);
    expect(entries.filter((entry) => entry.type === 'fix.reconciliation')).toHaveLength(2);
    const keys = await flow.db.auditEntry.findMany({
      where: { projectId: caller.projectId, type: 'fix.reconciliation' },
      select: { eventKey: true },
    });
    expect(new Set(keys.map((entry) => entry.eventKey)).size).toBe(2);
    expect(published).toBe(1);
  });
});
