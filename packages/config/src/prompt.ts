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

const pattern = (name: FixPromptPlaceholder): RegExp => new RegExp(`\\{\\{${name}\\}\\}`, 'g');

export function renderFixPrompt(template: string, values: FixPromptValues): string {
  return FIX_PROMPT_PLACEHOLDERS.reduce(
    (text, name) => text.replace(pattern(name), String(values[name])),
    template,
  );
}
