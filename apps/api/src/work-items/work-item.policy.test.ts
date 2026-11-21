import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorkItemPolicy, WorkItemPolicyError } from './work-item.policy';

const original = process.env.AGENTS_PATH;
const dir = join(tmpdir(), 'opencode');
const badPath = join(dir, 'graveshift-missing-agents.yaml');
const goodPath = join(dir, 'graveshift-good-agents.yaml');
const invalidPath = join(dir, 'graveshift-invalid-agents.yaml');

afterEach(() => {
  if (original === undefined) delete process.env.AGENTS_PATH;
  else process.env.AGENTS_PATH = original;
});

describe('createWorkItemPolicy', () => {
  test('reports a typed error when AGENTS_PATH cannot be read', async () => {
    process.env.AGENTS_PATH = badPath;
    try {
      await createWorkItemPolicy();
      throw new Error('expected createWorkItemPolicy to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkItemPolicyError);
      expect((error as WorkItemPolicyError).code).toBe('WORK_ITEM_POLICY_INVALID');
      expect((error as WorkItemPolicyError).message).toContain(badPath);
    }
  });

  test('reports a typed error when the agent config is invalid', async () => {
    await mkdir(dir, { recursive: true });
    await Bun.write(invalidPath, 'system: [{ name: 1 }]\n');
    process.env.AGENTS_PATH = invalidPath;
    try {
      await createWorkItemPolicy();
      throw new Error('expected createWorkItemPolicy to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkItemPolicyError);
      expect((error as WorkItemPolicyError).message).toContain('Invalid agent config');
    }
  });

  test('reads agent names from AGENTS_PATH', async () => {
    await mkdir(dir, { recursive: true });
    const example = new URL('../../../../agents.example.yaml', import.meta.url);
    await Bun.write(goodPath, await Bun.file(example).text());
    process.env.AGENTS_PATH = goodPath;
    const policy = await createWorkItemPolicy();
    expect(policy.agentNames).toContain('SRE Bot');
  });
});
