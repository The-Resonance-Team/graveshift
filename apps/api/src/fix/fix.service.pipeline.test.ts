import { describe, expect, test } from 'bun:test';
import { serviceWith } from './fix.test-fakes';
import { API_FIXED_TEXT, baseItem, sandboxConfig as sandbox } from './fix.test-helpers';

// The pipeline order after the policy gate: read, propose, resolve, verify,
// then publish. Each case below blocks one step and proves nothing is pushed.
describe('fix pipeline', () => {
  test('the base is read after the policy allow and before the model call', async () => {
    const { service, gatewayCalls, calls } = serviceWith();
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(true);
    const methods = calls.map((call) => call.method);
    const read = methods.indexOf('source.readBase');
    const push = methods.indexOf('createBlob');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(gatewayCalls).toHaveLength(1);
    // The prompt carries the real source text as untrusted data.
    expect(gatewayCalls[0]?.prompt).toContain('<untrusted_source_file_src/api.ts>');
    expect(gatewayCalls[0]?.prompt).toContain('export const broken = true;');
    expect(gatewayCalls[0]?.prompt).toContain('Base commit SHA: base-sha');
    expect(push).toBeGreaterThan(read);
  });

  test('a source read failure stops before the model call', async () => {
    const { service, gatewayCalls, calls } = serviceWith({
      sourceError: new Error('GET /git/trees responded 503'),
    });
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('source_unavailable');
    expect(result.reason).toContain('source_unavailable:');
    expect(result.reason).toContain('503');
    expect(gatewayCalls).toHaveLength(0);
    expect(calls.some((call) => call.method === 'createBlob')).toBe(false);
  });

  test('the sandbox verifies the resolved patch with the configured commands', async () => {
    const { service, workspaceCalls } = serviceWith();
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(true);
    expect(workspaceCalls).toHaveLength(1);
    const run = workspaceCalls[0]!;
    expect(run.patch).toEqual({
      files: [{ path: 'src/api.ts', content: API_FIXED_TEXT, linesChanged: 1 }],
    });
    expect(run.base.baseSha).toBe('base-sha');
    expect(run.base.treeSha).toBe('base-tree');
    expect(run.sandbox).toEqual(sandbox);
  });

  test('a failed sandbox check blocks the pull request', async () => {
    const { service, calls } = serviceWith({ checksFail: 'check failed with exit 1: bun test' });
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('checks_failed');
    expect(result.reason).toContain('check failed with exit 1');
    expect(result.item.draftPr).toBeNull();
    expect(calls.some((call) => call.method === 'createBlob')).toBe(false);
    expect(calls.some((call) => call.method === 'createPullRequest')).toBe(false);
  });

  test('a base that moved after the read blocks every push', async () => {
    const { service, calls } = serviceWith({ liveBaseSha: 'someone-elses-commit' });
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('stale_base');
    expect(result.reason).toContain('someone-elses-commit');
    expect(calls.some((call) => call.method === 'createBlob')).toBe(false);
    expect(calls.some((call) => call.method === 'createPullRequest')).toBe(false);
  });
});
