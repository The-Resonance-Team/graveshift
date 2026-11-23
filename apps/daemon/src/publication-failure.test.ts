import { FixerFault, PublicationError } from '@graveshift/fixer';
import { describe, expect, test } from 'bun:test';

import { caller, pr } from './flow-fixtures';
import { harness } from './flow-harness';

describe('publication failure classification', () => {
  test.each([
    new FixerFault('STALE_BASE', 'The verified base changed'),
    new PublicationError('blob', false),
    new PublicationError('tree', false),
    new PublicationError('commit', false),
  ])(
    'a known failure before a branch write clears admission and finishes the attempt',
    async (failure) => {
      const flow = harness();
      flow.options.execute = async () => ({
        intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
        publish: async () => {
          throw failure;
        },
        dispose: async () => {},
      });
      const result = await flow.commands().fixNow(caller, 'work-1', {});
      expect(result).toMatchObject({ ok: false, pr: null, failure: 'pr_failed' });
      expect(flow.runtime.snapshot.activeAttempt).toBeUndefined();
      expect(await flow.commands().fixNow(caller, 'work-1', {})).toEqual(result);
    },
  );

  test.each(['branch', 'draft'] as const)(
    'an uncertain %s write keeps its intent for reconciliation',
    async (phase) => {
      const flow = harness();
      flow.options.execute = async () => ({
        intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
        publish: async () => {
          throw new PublicationError(phase, true);
        },
        dispose: async () => {},
      });
      const result = await flow.commands().fixNow(caller, 'work-1', {});
      expect(result.failure).toBe('publication_uncertain');
      expect(flow.runtime.snapshot.activeAttempt).toMatchObject({
        state: 'uncertain',
        publication: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      });
    },
  );
});
