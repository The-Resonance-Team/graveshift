import { describe, expect, test } from 'bun:test';

import { FixExecutionError } from './execution';
import { caller, pr } from './flow-fixtures';
import { harness } from './flow-harness';

describe('publication failure classification', () => {
  test.each([
    new FixExecutionError('pr_failed', 'The verified base changed'),
    new FixExecutionError('pr_failed', 'draft publication failed during blob'),
    new FixExecutionError('pr_failed', 'draft publication failed during tree'),
    new FixExecutionError('pr_failed', 'draft publication failed during commit'),
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
          throw new FixExecutionError(
            'publication_uncertain',
            `draft publication failed during ${phase}`,
          );
        },
        dispose: async () => {},
      });
      const result = await flow.commands().fixNow(caller, 'work-1', {});
      expect(result.failure).toBe('publication_uncertain');
      expect(result.reason).toContain(`draft publication failed during ${phase}`);
      expect(flow.runtime.snapshot.activeAttempt).toMatchObject({
        state: 'uncertain',
        publication: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      });
    },
  );
});
