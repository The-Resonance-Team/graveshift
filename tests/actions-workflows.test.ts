import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

type Step = {
  env?: Record<string, string>;
  run?: string;
  uses?: string;
};

type Job = {
  permissions?: Record<string, string>;
  steps?: Step[];
  uses?: string;
};

type Workflow = {
  jobs?: Record<string, Job>;
  permissions?: Record<string, string>;
};

const workflowsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');

const parse = (name: string): Workflow =>
  Bun.YAML.parse(readFileSync(join(workflowsDir, name), 'utf8')) as Workflow;

const reusable = parse('oneshot-reusable.yml');
const entry = parse('oneshot.yml');

const steps = (workflow: Workflow): Step[] =>
  Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);

const runBlocks = (workflow: Workflow): string[] =>
  steps(workflow)
    .map((step) => step.run)
    .filter((run): run is string => run !== undefined);

const allRuns = [...runBlocks(reusable), ...runBlocks(entry)];

const actionRefs = (workflow: Workflow): string[] =>
  [
    ...Object.values(workflow.jobs ?? {})
      .map((job) => job.uses)
      .filter((ref): ref is string => ref !== undefined),
    ...steps(workflow)
      .map((step) => step.uses)
      .filter((ref): ref is string => ref !== undefined),
  ].filter((ref) => !ref.startsWith('./'));

describe('one-shot Actions workflows', () => {
  test('no daemon or long-running server is started', () => {
    for (const run of allRuns) {
      expect(run.toLowerCase()).not.toContain('daemon');
      expect(run.toLowerCase()).not.toMatch(/\bserve\b/);
      expect(run.toLowerCase()).not.toContain('bun.serve');
    }
  });

  test('no merge command is present', () => {
    for (const run of allRuns) {
      expect(run.toLowerCase()).not.toMatch(/\bmerge\b/);
    }
  });

  test('least-privilege permissions', () => {
    expect(reusable.permissions).toEqual({ contents: 'read' });
    expect(reusable.jobs?.patch?.permissions).toEqual({ contents: 'read' });
    expect(reusable.jobs?.['open-pr']?.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
    expect(entry.permissions).toEqual({ contents: 'read' });
  });

  test('third-party actions are pinned to full commit SHAs', () => {
    const pinned = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
    const refs = [...actionRefs(reusable), ...actionRefs(entry)];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toMatch(pinned);
    }
  });

  test('run blocks carry no workflow expressions and no key is printed', () => {
    for (const run of allRuns) {
      expect(run).not.toContain('${{');
    }
    expect(allRuns.join('\n')).toContain('::add-mask::');
  });

  test('payloads and secrets reach run steps only through env', () => {
    const patch = steps(reusable).find((step) => step.run !== undefined);
    expect(patch).toBeDefined();
    expect(patch?.env).toMatchObject({
      WORK_ITEM_ID: '${{ inputs.work_item_id }}',
      PATCH_PAYLOAD: '${{ inputs.patch_payload }}',
      MODEL_API_KEY: '${{ secrets.model_api_key }}',
    });

    const pr = steps(reusable).find((step) => step.run?.includes('gh pr create'));
    expect(pr).toBeDefined();
    expect(pr?.env).toMatchObject({
      GH_TOKEN: '${{ secrets.github_token }}',
      PR_TITLE: '${{ inputs.pr_title }}',
    });
  });
});
