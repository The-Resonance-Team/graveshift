import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..', '..');
const workflowsDir = join(root, '.github', 'workflows');
const workflows = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => ({
    name,
    content: readFileSync(join(workflowsDir, name), 'utf8'),
  }));

function jobBlocks(content: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let inJobs = false;
  let current: string | undefined;

  for (const line of content.split('\n')) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (inJobs && /^\S/.test(line)) {
      inJobs = false;
      current = undefined;
    }
    if (!inJobs) continue;

    const match = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (match) {
      current = match[1];
      blocks.set(current, []);
      continue;
    }
    if (current) blocks.get(current)!.push(line);
  }

  return blocks;
}

function hasPullRequestTrigger(content: string): boolean {
  return /^  pull_request:\s*$/m.test(content);
}

function callsReusableWorkflow(lines: string[]): boolean {
  return lines.some((line) => /^\s+uses:\s*\.\//.test(line));
}

describe('CI workflows', () => {
  test('workflows exist', () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  test('every workflow declares a concurrency block', () => {
    const missing = workflows
      .filter((workflow) => !/^concurrency:\s*$/m.test(workflow.content))
      .map((workflow) => workflow.name);
    expect(missing).toEqual([]);
  });

  test('every job sets timeout-minutes, except reusable workflow callers', () => {
    const missing: string[] = [];
    for (const workflow of workflows) {
      for (const [name, lines] of jobBlocks(workflow.content)) {
        if (callsReusableWorkflow(lines)) continue;
        if (!lines.some((line) => /^\s+timeout-minutes:\s*\d+\s*$/.test(line))) {
          missing.push(`${workflow.name}:${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('every pull request job guards against draft pull requests', () => {
    const unguarded: string[] = [];
    for (const workflow of workflows) {
      if (!hasPullRequestTrigger(workflow.content)) continue;
      for (const [name, lines] of jobBlocks(workflow.content)) {
        if (!lines.some((line) => /^\s+if:.*\bdraft\b/.test(line))) {
          unguarded.push(`${workflow.name}:${name}`);
        }
      }
    }
    expect(unguarded).toEqual([]);
  });

  test('verify depends on every job in ci.yml', () => {
    const ci = workflows.find((workflow) => workflow.name === 'ci.yml');
    expect(ci).toBeDefined();
    const blocks = jobBlocks(ci!.content);
    const needsLine = blocks.get('verify')?.find((line) => /^\s+needs:\s*\[/.test(line));
    expect(needsLine).toBeDefined();
    const listed =
      needsLine!
        .match(/\[([^\]]+)\]/)?.[1]
        ?.split(',')
        .map((name) => name.trim()) ?? [];
    const expected = [...blocks.keys()].filter((name) => name !== 'verify');
    expect(listed.sort()).toEqual(expected.sort());
  });

  test('every action ref is a full SHA with a version comment', () => {
    const invalid: string[] = [];
    for (const workflow of workflows) {
      for (const line of workflow.content.split('\n')) {
        if (!/^\s*-?\s*uses:\s/.test(line)) continue;
        if (/^\s*-?\s*uses:\s*\.\//.test(line)) continue;
        if (!/\S+@[0-9a-f]{40}\s+#\s+v\S+/.test(line)) {
          invalid.push(`${workflow.name}: ${line.trim()}`);
        }
      }
    }
    expect(invalid).toEqual([]);
  });

  test('workflows do not reference archived snapshots', () => {
    const references = workflows
      .filter((workflow) => /\bv2-\d+\b/.test(workflow.content))
      .map((workflow) => workflow.name);
    expect(references).toEqual([]);
  });

  test('root tests, config and Bun changes run the CI gates', () => {
    const content = workflows.find((workflow) => workflow.name === 'ci.yml')?.content ?? '';
    for (const input of ['tests/**', 'graveshift.config.yaml', 'bunfig.toml']) {
      expect(content).toContain(`- '${input}'`);
    }
  });
});
