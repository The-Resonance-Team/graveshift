import { UNTRUSTED_SYSTEM_NOTE, wrapUntrusted } from '@graveshift/agents/untrusted';
import type { GatewayResult, GatewayTask } from '@graveshift/gateway';
import { redact } from '@graveshift/redactor';

import { guardPatch, PatchRejectedError } from './guard';
import { type Patch, PatchSchema, type RepoRules, RepoRulesSchema } from './schemas';

export const PATCH_TASK = 'generate_patch';

// The system prompt is rendered from fix.promptTemplate before this call. No role
// or persona is hard-coded in this package. UNTRUSTED_SYSTEM_NOTE still travels
// with the rendered template so wrapped values keep their meaning to the model.
// Everything from the diagnosis is data. The model cannot grant a permission here.
// The canonical base identity is part of the contract: every patch names the base
// commit and the base blob of each changed file.
export const PATCH_SYSTEM = [
  'Propose a code patch for a work item.',
  UNTRUSTED_SYSTEM_NOTE,
  'Answer with one JSON object: {"baseSha","files":[{"path","content","linesChanged","baseBlobSha"}]}.',
  'baseSha is the 40-hex base commit SHA printed in the prompt.',
  'content is the full file text, or null to delete the file.',
  'linesChanged is a non-negative integer count of changed lines.',
  'baseBlobSha is the 40-hex blob SHA printed for a path that exists at the base.',
  'For a new path use the empty blob SHA e69de29bb2d1d6434b8b29ae775ad8c2e48c5391.',
  'For a deletion set content and baseBlobSha to null.',
  'Use only paths inside allowedPaths. Never change policy, deploy or workflow files.',
].join('\n');

// The gateway is injected. Tests use a fake run; no network and no key are used here.
export interface PatchGateway {
  run(task: GatewayTask<Patch>): Promise<GatewayResult<Patch>>;
}

export interface GeneratePatchOptions {
  gateway: PatchGateway;
  agent: string;
  // Rendered from the one prompt template in the committed config.
  system: string;
  rules: RepoRules;
  diagnosis: string;
  task?: string;
}

export type GeneratePatchResult =
  | { ok: true; patch: Patch }
  | { ok: false; error: PatchRejectedError };

const rejection = (reason: string): GeneratePatchResult => ({
  ok: false,
  error: new PatchRejectedError([reason]),
});

export async function generatePatch(options: GeneratePatchOptions): Promise<GeneratePatchResult> {
  const { gateway, agent, system, diagnosis, task = PATCH_TASK } = options;
  const checkedRules = RepoRulesSchema.safeParse(options.rules);
  if (!checkedRules.success) return rejection('invalid repository rules');
  const rules = checkedRules.data;
  const fullSystem = `${system}\n${UNTRUSTED_SYSTEM_NOTE}`;
  const prompt = [
    'Repository rules:',
    `maxFilesChanged=${rules.maxFilesChanged}`,
    `maxLinesChanged=${rules.maxLinesChanged}`,
    `allowedPaths=${JSON.stringify(rules.allowedPaths)}`,
    `forbiddenPaths=${JSON.stringify(rules.forbiddenPaths)}`,
    '',
    wrapUntrusted('diagnosis', diagnosis),
  ].join('\n');

  let result: GatewayResult<Patch>;
  try {
    result = await gateway.run({
      agent,
      task,
      system: fullSystem,
      prompt,
      schema: PatchSchema,
      validate: (patch) => {
        try {
          guardPatch(patch, rules);
          return undefined;
        } catch (error) {
          if (error instanceof PatchRejectedError) return error.reasons.join('; ');
          throw error;
        }
      },
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'unknown failure';
    return rejection(`patch call failed: ${redact(cause)}`);
  }

  if (result.status === 'unavailable')
    return rejection(`no patch source available: ${result.reason}`);
  if (result.status === 'invalid') return rejection(`invalid patch: ${result.reason}`);
  if (result.status !== 'ok') return rejection('no patch proposed');

  const parsed = PatchSchema.safeParse(result.value);
  if (!parsed.success) return rejection('invalid patch: schema validation failed');

  // The guard always runs before the caller can see a successful result.
  try {
    guardPatch(parsed.data, rules);
  } catch (error) {
    if (error instanceof PatchRejectedError) return { ok: false, error };
    return rejection('patch guard failed');
  }
  return { ok: true, patch: parsed.data };
}
