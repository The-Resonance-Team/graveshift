import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { FixExecutionError } from './execution';
import { setupFlow } from './flow.fixture';
import { caller, pr } from './flow-fixtures';

describe.skipIf(!dbTestEnabled)('publication failure classification', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  beforeEach(async () => {
    flow = await setupFlow();
  });
  afterEach(async () => {
    await flow?.close();
  });

  test.each([
    new FixExecutionError('pr_failed', 'The verified base changed'),
    new FixExecutionError('pr_failed', 'draft publication failed during blob'),
    new FixExecutionError('pr_failed', 'draft publication failed during tree'),
    new FixExecutionError('pr_failed', 'draft publication failed during commit'),
  ])(
    'a known failure before a branch write clears admission and finishes the attempt',
    async (failure) => {
      flow.options.execute = async () => ({
        intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
        publish: async () => {
          throw failure;
        },
        dispose: async () => {},
      });
      const result = await flow.commands().fixNow(caller, 'work-1', {});
      expect(result).toMatchObject({ ok: false, pr: null, failure: 'pr_failed' });
      expect((await flow.read()).activeAttempt).toBeUndefined();
      expect(await flow.commands().fixNow(caller, 'work-1', {})).toEqual(result);
      expect(flow.calls.filter((call) => call === 'claim')).toEqual(['claim']);
    },
  );

  test.each(['branch', 'draft'] as const)(
    'an uncertain %s write keeps its intent for reconciliation',
    async (phase) => {
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
      expect((await flow.read()).activeAttempt).toMatchObject({
        state: 'uncertain',
        publication: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
      });
    },
  );
});
