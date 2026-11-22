import { UNTRUSTED_SYSTEM_NOTE, wrapUntrusted } from '@graveshift/agents/untrusted';
import type { GatewayResult, GatewayTask } from '@graveshift/gateway';
import { redact } from '@graveshift/redactor';

import { guardPatch, PatchRejectedError } from './guard';
import { type Patch, PatchSchema, type RepoRules } from './schemas';

export const PATCH_TASK = 'generate_patch';

// The system prompt is rendered from fix.promptTemplate before this call. No role
// or persona is hard-coded in this package. UNTRUSTED_SYSTEM_NOTE still travels
// with the rendered template so wrapped values keep their meaning to the model.

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
  const { gateway, agent, system, rules, diagnosis, task = PATCH_TASK } = options;
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
      validate: (candidate) => {
        try {
          guardPatch(candidate, rules);
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : 'patch rejected';
        }
      },
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'unknown failure';
    return rejection(`patch call failed: ${redact(cause)}`);
  }

  if (result.status === 'unavailable') return rejection('no patch source available');
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
