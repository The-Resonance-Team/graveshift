import { describe, expect, test } from 'bun:test';

import { renderFixPrompt, type FixPromptValues } from './prompt';

const values: FixPromptValues = {
  AGENT_NAME: 'Exorcist',
  AGENT_ROLE: 'exorcist',
  AGENT_DESCRIPTION: 'Proposes a guarded patch.',
  AGENT_PROMPT: 'Propose one minimal patch.',
  MODEL: 'test-model',
  PROVIDER: '@ai-sdk/anthropic',
  DAILY_BUDGET_USD: 2.5,
  DIAGNOSIS: "literal $& and $' and $` and {{RULES}} text",
  RULES: 'allow src/**',
};

describe('renderFixPrompt', () => {
  test('renders every declared placeholder once', () => {
    const out = renderFixPrompt(
      '{{AGENT_NAME}}/{{AGENT_ROLE}}/{{AGENT_DESCRIPTION}}/{{AGENT_PROMPT}}/{{MODEL}}/{{PROVIDER}}/{{DAILY_BUDGET_USD}}/{{DIAGNOSIS}}/{{RULES}}',
      { ...values, DIAGNOSIS: 'a plain diagnosis' },
    );
    expect(out).toContain('Exorcist/exorcist');
    expect(out).toContain('test-model/@ai-sdk/anthropic/2.5');
    expect(out).toContain('a plain diagnosis');
    expect(out.endsWith('allow src/**')).toBe(true);
    expect(out).not.toContain('{{');
  });

  test('keeps dollar sequences and nested placeholders in the diagnosis literal', () => {
    const out = renderFixPrompt('{{DIAGNOSIS}}|{{RULES}}', values);
    expect(out).toBe("literal $& and $' and $` and {{RULES}} text|allow src/**");
  });

  test('leaves an unknown placeholder untouched', () => {
    expect(renderFixPrompt('{{UNKNOWN}} {{AGENT_NAME}}', values)).toBe('{{UNKNOWN}} Exorcist');
  });
});
