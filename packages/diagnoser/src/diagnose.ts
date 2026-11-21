import { type Diagnosis, DiagnosisSchema } from '@graveshift/core';
import type { Gateway } from '@graveshift/gateway';

import { buildContext, SYSTEM_PROMPT } from './context';
import { rulesOnlyDiagnosis } from './rules-only';
import {
  type Category,
  type ContextBundle,
  type DiagnoseInput,
  type LlmDiagnosis,
  LlmDiagnosisSchema,
} from './types';

export type DiagnoseResult =
  | { status: 'diagnosed'; diagnosis: Diagnosis; category: Category; source: 'llm' | 'rules-only' }
  | { status: 'needs_human'; reason: string };

export interface DiagnoseDeps {
  gateway: Pick<Gateway, 'run'>;
  agent: string;
  now?: () => Date;
  newId?: () => string;
}

export function validateEvidence(output: LlmDiagnosis, bundle: ContextBundle): string | undefined {
  const unseen = output.evidence.find((e) => !bundle.refs.has(e.ref));
  if (unseen) return `evidence ref "${unseen.ref}" does not appear in the context`;
  if (output.category === 'unknown' && output.confidence >= 0.5) {
    return 'category unknown requires confidence below 0.5';
  }
  return undefined;
}

export async function diagnose(
  { gateway, agent, now = () => new Date(), newId = () => crypto.randomUUID() }: DiagnoseDeps,
  input: DiagnoseInput,
): Promise<DiagnoseResult> {
  const bundle = buildContext(input);
  const result = await gateway.run({
    agent,
    task: 'diagnose',
    system: SYSTEM_PROMPT,
    prompt: bundle.prompt,
    schema: LlmDiagnosisSchema,
    validate: (output) => validateEvidence(output, bundle),
    rulesOnly: () => rulesOnlyDiagnosis(input, bundle),
  });

  if (result.status === 'invalid') return { status: 'needs_human', reason: result.reason };
  if (result.status === 'unavailable')
    return { status: 'needs_human', reason: 'no diagnosis source available' };

  const { category, rootCause, confidence, evidence } = result.value;
  const diagnosis = DiagnosisSchema.parse({
    id: newId(),
    incidentId: input.incident.id,
    rootCause,
    evidence,
    confidence,
    createdAt: now().toISOString(),
  });
  return {
    status: 'diagnosed',
    diagnosis,
    category,
    source: result.status === 'ok' ? 'llm' : 'rules-only',
  };
}
