// The one patch prompt template lives in graveshift.config.yaml. These are the
// only placeholders the template may use. No role or persona is hard-coded here.
export const FIX_PROMPT_PLACEHOLDERS = [
  'AGENT_NAME',
  'AGENT_ROLE',
  'AGENT_DESCRIPTION',
  'AGENT_PROMPT',
  'MODEL',
  'PROVIDER',
  'DAILY_BUDGET_USD',
  'DIAGNOSIS',
  'RULES',
] as const;

export type FixPromptPlaceholder = (typeof FIX_PROMPT_PLACEHOLDERS)[number];

export interface FixPromptValues {
  AGENT_NAME: string;
  AGENT_ROLE: string;
  AGENT_DESCRIPTION: string;
  AGENT_PROMPT: string;
  MODEL: string;
  PROVIDER: string;
  DAILY_BUDGET_USD: number;
  // Already wrapped as untrusted data by the caller.
  DIAGNOSIS: string;
  RULES: string;
}

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const allowed = new Set<string>(FIX_PROMPT_PLACEHOLDERS);

// One pass over the template. A function replacer keeps $ sequences in a value
// literal, and a single pass keeps a placeholder inside an inserted value from
// being expanded by a later placeholder.
export function renderFixPrompt(template: string, values: FixPromptValues): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    if (!allowed.has(name)) return match;
    return String(values[name as FixPromptPlaceholder]);
  });
}
