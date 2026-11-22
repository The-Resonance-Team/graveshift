import { createGateway, type ModelAdapter } from '@graveshift/gateway';
import { describe, expect, test } from 'bun:test';

import { gatewayAudit } from './audit';
import { createFixExecutor } from './fix-execution';
import { githubRecording, gitChecks } from './fix-recording';
import { agent, caller, context } from './flow-fixtures';
import { harness } from './flow-harness';

const TEST_BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
// Blob SHA of the source text recorded by githubRecording() for src/main.ts.
const BASE_BLOB_SHA = '96759cc1f604468aa78a72be3c5be39abfc788b2';

const recorded = () => {
  const recording = githubRecording();
  recording.client.getBaseSha = async () => TEST_BASE_SHA;
  return recording;
};

function configured(failAudit = false) {
  const selected = agent();
  const prompts: Array<{ system: string; prompt: string }> = [];
  const audit: string[] = [];
  const adapter: ModelAdapter = {
    provider: selected.provider,
    model: selected.model,
    capability: 'structured_language',
    available: () => true,
    async generateObject(request) {
      prompts.push(request);
      return {
        object: {
          baseSha: TEST_BASE_SHA,
          files: [
            {
              path: 'src/main.ts',
              content: 'export const state = "fixed";\n',
              linesChanged: 0,
              baseBlobSha: BASE_BLOB_SHA,
            },
          ],
        },
        model: selected.model,
        usage: { in: 20, out: 10 },
      };
    },
  };
  const gateway = createGateway({
    agents: [{ agent: selected, adapter }],
    config: {
      globalDailyBudgetUsd: 10,
      maxRetries: 0,
      timeoutMs: 1000,
      priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 2 } },
    },
    onAudit: gatewayAudit(async (draft) => {
      if (failAudit) throw new Error('Durable audit unavailable');
      audit.push(draft.key);
    }),
  });
  return { gateway, prompts, audit };
}

async function input() {
  const flow = harness();
  const claim = await flow.runtime.claim(caller, 'work-1', {
    expectedVersion: 0,
    command: { kind: 'fix_now', body: {} },
  });
  if (claim.kind !== 'claimed') throw new Error('Expected claim');
  return {
    caller,
    snapshot: claim.snapshot,
    attempt: claim.attempt,
    context: context(),
    agent: agent(),
    prompt: 'Use the configured Agent instructions for v2',
  };
}

describe('concrete daemon fix executor', () => {
  test('uses source and assigned instructions, verifies the actual diff, and publishes the verified base', async () => {
    const recording = recorded();
    const model = configured();
    const executor = createFixExecutor({
      client: recording.client,
      gateway: model.gateway,
      verification: { 'team/grave': { commands: [['git', 'diff', '--check']], timeoutMs: 10_000 } },
      dashboardUrl: '',
      runner: gitChecks,
    });
    const prepared = await executor(await input());
    expect(recording.writes).toEqual([]);
    expect(prepared.intent).toMatchObject({ repo: 'team/grave', baseSha: TEST_BASE_SHA });
    expect(model.prompts[0]?.system).toContain('configured Agent instructions for v2');
    expect(model.prompts[0]?.prompt).toContain(`Source base: ${TEST_BASE_SHA}`);
    expect(model.prompts[0]?.prompt).toContain('broken');
    expect(model.audit).toHaveLength(1);
    const result = await prepared.publish();
    expect(result).toMatchObject({ number: 8, headSha: 'head-sha' });
    expect(recording.writes).toContainEqual(expect.objectContaining({ base: TEST_BASE_SHA }));
    expect(recording.writes).toContainEqual(expect.objectContaining({ draft: true }));
    const publication = JSON.stringify(recording.writes);
    expect(publication).toContain('git diff --check');
    expect(publication).toContain('fixed');
    await prepared.dispose();
  });

  test('a failed required model audit stops before verification or a GitHub write', async () => {
    const recording = recorded();
    const model = configured(true);
    let checks = 0;
    const executor = createFixExecutor({
      client: recording.client,
      gateway: model.gateway,
      verification: { 'team/grave': { commands: [['git', 'diff', '--check']], timeoutMs: 1000 } },
      dashboardUrl: '',
      runner: async () => {
        checks++;
        throw new Error('Must not verify an unaudited patch');
      },
    });
    await expect(executor(await input())).rejects.toMatchObject({ failure: 'audit_failed' });
    expect(model.prompts).toHaveLength(1);
    expect(checks).toBe(0);
    expect(recording.writes).toEqual([]);
  });

  test('missing repository checks fail before source and model access', async () => {
    const recording = recorded();
    const model = configured();
    await expect(
      createFixExecutor({
        client: recording.client,
        gateway: model.gateway,
        verification: {},
        dashboardUrl: '',
      })(await input()),
    ).rejects.toMatchObject({ failure: 'fix_error' });
    expect(recording.calls).toEqual([]);
    expect(model.prompts).toEqual([]);
  });

  test('a failed repository check prevents the draft even when the model patch is valid', async () => {
    const recording = recorded();
    const model = configured();
    const executor = createFixExecutor({
      client: recording.client,
      gateway: model.gateway,
      verification: { 'team/grave': { commands: [['git', 'diff', '--check']], timeoutMs: 1000 } },
      dashboardUrl: '',
      runner: async () => ({ exitCode: 1, stdout: '', timedOut: false }),
    });
    await expect(executor(await input())).rejects.toMatchObject({ code: 'CHECK_FAILED' });
    expect(recording.writes).toEqual([]);
  });
});
