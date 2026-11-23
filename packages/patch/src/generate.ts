import { UNTRUSTED_SYSTEM_NOTE, wrapUntrusted } from '@graveshift/agents/untrusted';
import type { GatewayResult, GatewayTask } from '@graveshift/gateway';
import { redact } from '@graveshift/redactor';

import { guardPatch, PatchRejectedError } from './guard';
import { type BaseFile, type PatchSummary, resolvePatch, type ResolveResult } from './resolve';
import { type Patch, type PatchProposal, PatchProposalSchema, type RepoRules } from './schemas';

export const PATCH_TASK = 'generate_patch';

// The prompt carries at most this much real source text per file and in total.
// ponytail: fixed byte caps bound the prompt; upgrade when the gateway enforces token budgets
const MAX_PROMPT_FILE_BYTES = 16_384;
const MAX_PROMPT_TOTAL_BYTES = 98_304;

// The system prompt is rendered from fix.promptTemplate before this call. No role
// or persona is hard-coded in this package. UNTRUSTED_SYSTEM_NOTE still travels
// with the rendered template so wrapped values keep their meaning to the model.

// The gateway is injected. Tests use a fake run; no network and no key are used here.
export interface PatchGateway {
  run(task: GatewayTask<PatchProposal>): Promise<GatewayResult<PatchProposal>>;
}

export interface PatchBase {
  readonly baseSha: string;
  readonly files: readonly BaseFile[];
}

export interface GeneratePatchOptions {
  gateway: PatchGateway;
  agent: string;
  // Rendered from the one prompt template in the committed config.
  system: string;
  rules: RepoRules;
  diagnosis: string;
  task?: string;
  // The real base tree the model must pin its proposal to.
  base: PatchBase;
}

export type GeneratePatchResult =
  | { ok: true; patch: Patch; summary: PatchSummary }
  | { ok: false; error: PatchRejectedError };

const rejection = (reason: string): GeneratePatchResult => ({
  ok: false,
  error: new PatchRejectedError([reason]),
});

// Real file text enters the prompt as untrusted data. The model must echo the
// base SHA and the base blob SHAs back exactly, so the change is pinned.
function sourceSection(base: PatchBase, rules: RepoRules): string {
  const lines = [
    'Repository rules:',
    `maxFilesChanged=${rules.maxFilesChanged}`,
    `maxLinesChanged=${rules.maxLinesChanged}`,
    `allowedPaths=${JSON.stringify(rules.allowedPaths)}`,
    `forbiddenPaths=${JSON.stringify(rules.forbiddenPaths)}`,
    '',
    `Base commit SHA: ${base.baseSha}`,
    'Base files (path then base blob SHA). Echo baseSha and baseBlobSha exactly.',
    ...base.files.map((file) => `- ${file.path} ${file.blobSha}`),
  ];
  let total = 0;
  let omitted = 0;
  for (const file of base.files) {
    if (file.text === null) {
      lines.push('', `${file.path}: binary file, content not shown`);
      continue;
    }
    if (total >= MAX_PROMPT_TOTAL_BYTES || file.text.length > MAX_PROMPT_FILE_BYTES) {
      omitted++;
      continue;
    }
    total += file.text.length;
    lines.push('', wrapUntrusted(`source_file_${file.path}`, file.text));
  }
  if (omitted > 0)
    lines.push('', `${omitted} file(s) too large to show; use full content to change them.`);
  return lines.join('\n');
}

function checked(patchBase: PatchBase, rules: RepoRules) {
  return (candidate: unknown): string | undefined => {
    try {
      const parsed = PatchProposalSchema.safeParse(candidate);
      if (!parsed.success) return `invalid proposal: ${parsed.error.message}`;
      const resolved = resolvePatch(parsed.data, patchBase);
      if (!resolved.ok) return resolved.reasons.join('; ');
      guardPatch(resolved.patch, rules);
      return undefined;
    } catch (error) {
      return error instanceof Error ? redact(error.message) : 'patch rejected';
    }
  };
}

export async function generatePatch(options: GeneratePatchOptions): Promise<GeneratePatchResult> {
  const { gateway, agent, system, rules, diagnosis, task = PATCH_TASK, base } = options;
  const fullSystem = `${system}\n${UNTRUSTED_SYSTEM_NOTE}`;
  const prompt = [sourceSection(base, rules), '', wrapUntrusted('diagnosis', diagnosis)].join('\n');
  const validate = checked(base, rules);

  let result: GatewayResult<PatchProposal>;
  try {
    result = await gateway.run({
      agent,
      task,
      system: fullSystem,
      prompt,
      schema: PatchProposalSchema,
      validate,
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'unknown failure';
    return rejection(`patch call failed: ${redact(cause)}`);
  }

  if (result.status === 'unavailable') return rejection('no patch source available');
  if (result.status === 'invalid') return rejection(`invalid patch: ${result.reason}`);
  if (result.status !== 'ok') return rejection('no patch proposed');

  // Re-validate and resolve outside the gateway: the caller must never see a
  // value that did not pass the guard and the base check.
  const parsed = PatchProposalSchema.safeParse(result.value);
  if (!parsed.success) return rejection('invalid patch: schema validation failed');
  let resolved: ResolveResult;
  try {
    const outcome = resolvePatch(parsed.data, base);
    if (!outcome.ok) return rejection(`invalid patch: ${outcome.reasons.join('; ')}`);
    guardPatch(outcome.patch, rules);
    resolved = outcome;
  } catch (error) {
    if (error instanceof PatchRejectedError) return { ok: false, error };
    return rejection('patch guard failed');
  }
  return { ok: true, patch: resolved.patch, summary: resolved.summary };
}
