import type { Incident } from '@graveshift/core';
import type { Detection } from '@graveshift/watcher';
import { z } from 'zod';

export const CATEGORIES = [
  'code_bug',
  'config_error',
  'deploy_regression',
  'resource_exhaustion',
  'unknown',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const LlmDiagnosisSchema = z.object({
  category: CategorySchema,
  rootCause: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({ ref: z.string().min(1), excerpt: z.string().min(1) })).min(1),
});
export type LlmDiagnosis = z.infer<typeof LlmDiagnosisSchema>;

export interface DiagnoseInput {
  incident: Incident;
  detections: Detection[];
  logs: string[];
  files: Array<{ path: string; content: string }>;
  commits: Array<{ sha: string; message: string }>;
}

export interface ContextBundle {
  prompt: string;
  refs: ReadonlyMap<string, string>;
  evidence: readonly PreparedEvidence[];
}

export interface PreparedEvidence {
  ref: string;
  kind: 'incident' | 'signal' | 'log' | 'file' | 'commit';
  text: string;
  label?: string;
  rule?: string;
}

export const LIMITS = { logLines: 300, files: 5, fileLines: 400, commits: 3 } as const;
