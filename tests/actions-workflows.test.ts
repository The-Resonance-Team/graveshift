import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import {
  assertBranchSlug,
  assertPayloadSize,
  assertPolicyAllow,
  BRANCH_SLUG_PATTERN,
  MAX_PATCH_PAYLOAD_BYTES,
} from '../scripts/actions/one-shot';

type Step = {
  env?: Record<string, string>;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string | boolean | number>;
};

type Job = {
  permissions?: Record<string, string>;
  secrets?: Record<string, string>;
  steps?: Step[];
  uses?: string;
  with?: Record<string, string>;
};

type Trigger = {
  inputs?: Record<string, { type?: string }>;
  secrets?: Record<string, unknown>;
};

type Workflow = {
  concurrency?: { group?: string };
  jobs?: Record<string, Job>;
  on?: { workflow_call?: Trigger; workflow_dispatch?: Trigger };
  permissions?: Record<string, string>;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parse = (name: string): Workflow =>
  Bun.YAML.parse(readFileSync(join(root, '.github', 'workflows', name), 'utf8')) as Workflow;

const reusable = parse('oneshot-reusable.yml');
const entry = parse('oneshot.yml');
const INPUTS = [
  'work_item_id',
  'incident_ref',
  'branch_slug',
  'patch_payload',
  'policy_decision',
  'pr_title',
  'base_ref',
] as const;

const steps = (workflow: Workflow): Step[] =>
  Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);

const stepNamed = (workflow: Workflow, name: string): Step => {
  const found = steps(workflow).find((step) => step.name === name);
  if (found === undefined) throw new Error(`missing step ${name}`);
  return found;
};

const stepText = (step: Step): string =>
  [
    step.name ?? '',
    step.uses ?? '',
    step.run ?? '',
    ...Object.values(step.env ?? {}),
    ...Object.values(step.with ?? {}).map(String),
  ].join('\n');

const allText = (workflow: Workflow): string =>
  [
    ...steps(workflow).map(stepText),
    ...Object.values(workflow.jobs ?? {}).flatMap((job) => [
      job.uses ?? '',
      ...Object.values(job.with ?? {}),
    ]),
  ].join('\n');

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
  test('triggers declare typed inputs and secrets', () => {
    const call = reusable.on?.workflow_call;
    const dispatch = entry.on?.workflow_dispatch;
    expect(call).toBeDefined();
    expect(dispatch).toBeDefined();
    for (const name of INPUTS) {
      expect(call?.inputs?.[name]?.type).toBe('string');
      expect(dispatch?.inputs?.[name]?.type).toBe('string');
    }
    expect(Object.keys(call?.secrets ?? {})).toEqual(['model_api_key', 'pr_token']);
  });

  test('manual workflow forwards inputs and secrets to the reusable workflow', () => {
    const job = entry.jobs?.oneshot;
    expect(job?.uses).toBe('./.github/workflows/oneshot-reusable.yml');
    for (const name of INPUTS) {
      expect(job?.with?.[name]).toBe(`\${{ inputs.${name} }}`);
    }
    expect(job?.with).not.toHaveProperty('github_token');
    expect(job?.secrets).toEqual({
      model_api_key: '${{ secrets.MODEL_API_KEY }}',
      pr_token: '${{ secrets.GRAVESHIFT_PR_TOKEN }}',
    });
  });

  test('concurrency keys on work item id', () => {
    expect(reusable.concurrency?.group).toContain('inputs.work_item_id');
    expect(entry.concurrency?.group).toContain('inputs.work_item_id');
    expect(reusable.concurrency?.group).not.toContain('github.ref');
    expect(entry.concurrency?.group).not.toContain('github.ref');
  });

  test('least-privilege permissions and no persisted checkout credentials', () => {
    expect(reusable.permissions).toEqual({ contents: 'read' });
    expect(reusable.jobs?.patch?.permissions).toEqual({ contents: 'read' });
    expect(reusable.jobs?.['open-pr']?.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
    expect(entry.permissions).toEqual({ contents: 'read' });
    for (const step of [...steps(reusable), ...steps(entry)]) {
      if (step.uses?.startsWith('actions/checkout@')) {
        expect(step.with).toMatchObject({ 'persist-credentials': false });
      }
    }
  });

  test('third-party actions are pinned to full commit SHAs', () => {
    const pinned = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
    const refs = [...actionRefs(reusable), ...actionRefs(entry)];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toMatch(pinned);
  });

  test('no daemon start or merge in names, uses, with, env or run', () => {
    for (const text of [allText(reusable), allText(entry)]) {
      const lower = text.toLowerCase();
      expect(lower).not.toContain('daemon');
      expect(lower).not.toMatch(/\bserve\b/);
      expect(lower).not.toMatch(/\bmerge\b/);
    }
  });

  test('run blocks carry no workflow expressions', () => {
    for (const run of allRuns) expect(run).not.toContain('${{');
  });

  test('patch artifact handoff applies, pushes and opens a draft PR', () => {
    const upload = stepNamed(reusable, 'Upload patch');
    const download = stepNamed(reusable, 'Download patch');
    expect(upload.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(download.uses).toMatch(/^actions\/download-artifact@[0-9a-f]{40}$/);
    expect(upload.with?.name).toBe('oneshot-patch');
    expect(download.with?.name).toBe('oneshot-patch');
    expect(stepNamed(reusable, 'Apply patch and push branch').run).toContain(
      'scripts/actions/apply-patch.ts',
    );

    const pr = stepNamed(reusable, 'Open draft pull request');
    expect(pr.run).toContain('gh pr create');
    expect(pr.run).toContain('--draft');
    expect(pr.run).toContain('--base "$BASE_REF"');
    expect(pr.run).toContain('--head "$BRANCH_SLUG"');
    expect(pr.env?.BASE_REF).toBe('${{ inputs.base_ref }}');
    expect(pr.env?.GH_TOKEN).toBe('${{ secrets.pr_token }}');
    for (const step of steps(reusable)) {
      if (step.uses?.startsWith('actions/checkout@')) {
        expect(step.with?.ref).toBe('${{ inputs.base_ref }}');
      }
    }
  });

  test('model key is masked before use and never echoed', () => {
    const prepare = stepNamed(reusable, 'Prepare patch');
    const lines = (prepare.run ?? '').split('\n');
    const maskAt = lines.findIndex((line) => line.includes('::add-mask::$MODEL_API_KEY'));
    const useAt = lines.findIndex((line) => line.includes('bun run'));
    expect(maskAt).toBeGreaterThanOrEqual(0);
    expect(useAt).toBeGreaterThan(maskAt);
    for (const [index, line] of lines.entries()) {
      if (index === maskAt) continue;
      if (/\b(echo|printf)\b/.test(line)) expect(line).not.toContain('MODEL_API_KEY');
    }
    expect(prepare.env?.MODEL_API_KEY).toBe('${{ secrets.model_api_key }}');
  });

  test('prepare and apply validate inputs before any patch write', () => {
    const prepare = stepNamed(reusable, 'Prepare patch');
    expect(prepare.env).toMatchObject({
      BRANCH_SLUG: '${{ inputs.branch_slug }}',
      PATCH_PAYLOAD: '${{ inputs.patch_payload }}',
      POLICY_DECISION: '${{ inputs.policy_decision }}',
    });
    expect(prepare.run).toContain('scripts/actions/prepare-patch.ts');
    const prepareSource = readFileSync(
      join(root, 'scripts', 'actions', 'prepare-patch.ts'),
      'utf8',
    );
    expect(prepareSource.indexOf('assertBranchSlug')).toBeLessThan(
      prepareSource.indexOf('Bun.write'),
    );
    expect(prepareSource).toContain('redactPatch');

    const apply = stepNamed(reusable, 'Apply patch and push branch');
    expect(apply.env?.BRANCH_SLUG).toBe('${{ inputs.branch_slug }}');
    const applySource = readFileSync(join(root, 'scripts', 'actions', 'apply-patch.ts'), 'utf8');
    expect(applySource.indexOf('assertBranchSlug')).toBeLessThan(applySource.indexOf('git(['));
  });

  test('unsafe branch slugs are rejected', () => {
    expect(BRANCH_SLUG_PATTERN.source).toBe('^graveshift\\/[A-Za-z0-9._/-]+$');
    for (const slug of [
      'main',
      'fix/main',
      'graveshift/',
      'graveshift/../main',
      'graveshift/a b',
    ]) {
      expect(() => assertBranchSlug(slug)).toThrow();
    }
    expect(assertBranchSlug('graveshift/inc-123-fix')).toBe('graveshift/inc-123-fix');
    expect(() => assertBranchSlug(undefined)).toThrow();
  });

  test('untrusted payload and policy decision fail closed', () => {
    expect(() => assertPolicyAllow('{"effect":"deny"}')).toThrow();
    expect(() => assertPolicyAllow('{"effect":"allow","action":"restart_service"}')).toThrow();
    expect(() => assertPolicyAllow('not json')).toThrow();
    expect(() => assertPolicyAllow('{"effect":"allow","action":"open_pr"}')).not.toThrow();
    expect(() => assertPayloadSize('x'.repeat(MAX_PATCH_PAYLOAD_BYTES + 1))).toThrow();
    expect(() => assertPayloadSize(undefined)).toThrow();
  });
});
