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

  test('every job sets timeout-minutes', () => {
    const missing: string[] = [];
    for (const workflow of workflows) {
      for (const [name, lines] of jobBlocks(workflow.content)) {
        if (!lines.some((line) => /^\s+timeout-minutes:\s*\d+\s*$/.test(line))) {
          missing.push(`${workflow.name}:${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
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
});
