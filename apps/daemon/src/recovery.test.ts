import { PublicationError } from '@graveshift/fixer';
import { describe, expect, test } from 'bun:test';

import { caller, pr } from './flow-fixtures';
import { harness } from './flow-harness';
import { createWorkCommands } from './work-flow';

describe('publication recovery', () => {
  test('replays an uncertain command through recovery without another model or publication', async () => {
    const flow = harness();
    const publish = Promise.withResolvers<void>();
    let publications = 0;
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        publications++;
        await publish.promise;
        throw new PublicationError('draft', true);
      },
      dispose: async () => {},
    });
    publish.resolve();
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
    expect(flow.requests).toHaveLength(0);
  });

  test('recovery does not publish when the remote draft is still unknown', async () => {
    const flow = harness();
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        throw new PublicationError('draft', true);
      },
      dispose: async () => {},
    });
    const uncertain = await flow.commands().fixNow(caller, 'work-1', {});
    const result = await createWorkCommands(flow.options).fixNow(caller, 'work-1', {});
    expect(result).toEqual(uncertain);
    expect(flow.runtime.snapshot.activeAttempt?.state).toBe('uncertain');
  });

  test('recovers a committed PR after the original completion response was lost', async () => {
    const flow = harness();
    flow.runtime.failFinish = true;
    const uncertain = await flow.commands().fixNow(caller, 'work-1', {});
    expect(uncertain.pr).toEqual(pr);
    flow.runtime.failFinish = false;
    const recovered = await createWorkCommands(flow.options).fixNow(caller, 'work-1', {});
    expect(recovered).toMatchObject({ ok: true, pr });
    expect(flow.effects.filter((effect) => effect === 'publish')).toHaveLength(1);
    expect(flow.requests).toHaveLength(1);
  });

  test('retains a reference carried by a publication error', async () => {
    const flow = harness();
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        throw new PublicationError('draft', true, pr);
      },
      dispose: async () => {},
    });
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    expect(result).toMatchObject({ pr, item: { draftPr: pr }, failure: 'publication_uncertain' });
  });

  test('reconciles an admitted draft when the saved intent consumes the current publication limit', async () => {
    const flow = harness();
    let published = 0;
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        published++;
        throw new PublicationError('draft', true);
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
    expect(published).toBe(1);
    expect(flow.audit.at(-1)?.type).toBe('fix.reconciliation');
  });

  test('each reconciliation read has its own durable audit key and never repeats publication', async () => {
    const flow = harness();
    let published = 0;
    flow.options.execute = async () => ({
      intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      publish: async () => {
        published++;
        throw new PublicationError('draft', true);
      },
      dispose: async () => {},
    });
    await flow.commands().fixNow(caller, 'work-1', {});
    const restarted = createWorkCommands(flow.options);
    await restarted.fixNow(caller, 'work-1', {});
    flow.options.recover = async () => pr;
    expect(await restarted.fixNow(caller, 'work-1', {})).toMatchObject({ ok: true, pr });
    const reconciliation = flow.audit.filter((draft) => draft.type === 'fix.reconciliation');
    expect(reconciliation).toHaveLength(2);
    expect(new Set(reconciliation.map((draft) => draft.key)).size).toBe(2);
    expect(published).toBe(1);
  });
});
