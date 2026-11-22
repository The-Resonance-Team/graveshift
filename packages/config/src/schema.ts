import { AgentsFileSchema } from '@graveshift/agents';
import { PolicySchema } from '@graveshift/policy';
import { z } from 'zod';

import { FIX_PROMPT_PLACEHOLDERS } from './prompt';

const ENV_NAME = /^(?:GRAVESHIFT_[A-Z0-9_]+|[A-Z][A-Z0-9_]*_API_KEY)$/;
const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export const BootConfigSchema = z
  .object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65_535),
  })
  .strict();

export const FixConfigSchema = z
  .object({
    enabled: z.boolean(),
    // The name of the Agent in agents.system (or agents.client) that owns patches.
    agent: z.string().min(1),
    promptTemplate: z.string().min(1),
    gateway: z
      .object({
        globalDailyBudgetUsd: z.number().min(0),
        maxRetries: z.number().int().min(0),
        timeoutMs: z.number().int().positive(),
        priceTableUsdPer1M: z.record(
          z.string(),
          z.object({ in: z.number().min(0), out: z.number().min(0) }),
        ),
      })
      .strict(),
    github: z
      .object({
        appIdEnv: z.string().regex(ENV_NAME),
        privateKeyEnv: z.string().regex(ENV_NAME),
        // Installation ids are not secrets. Repo names match policy.github.repos[].repo.
        installations: z.record(z.string().min(1), z.number().int().positive()),
      })
      .strict(),
  })
  .strict()
  .superRefine((fix, ctx) => {
    const used = [...fix.promptTemplate.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
    const names = new Set<string>(used);
    const allowed = new Set<string>(FIX_PROMPT_PLACEHOLDERS);
    const missing = FIX_PROMPT_PLACEHOLDERS.filter((name) => !names.has(name));
    const unknown = [...names].filter((name) => !allowed.has(name));
    if (missing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['promptTemplate'],
        message: `missing placeholders: ${missing.join(', ')}`,
      });
    }
    if (unknown.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['promptTemplate'],
        message: `unknown placeholders: ${unknown.join(', ')}`,
      });
    }
  });

export const GraveshiftConfigSchema = z
  .object({
    boot: BootConfigSchema,
    // Strict agents schema: unknown keys and undeclared prompt params fail boot.
    agents: AgentsFileSchema,
    // The policy schema owns policy rules and limits; it is nested unchanged.
    policy: PolicySchema,
    fix: FixConfigSchema,
  })
  .strict()
  .superRefine((config, ctx) => {
    const names = new Set([
      ...config.agents.system.map((agent) => agent.name),
      ...config.agents.client.map((agent) => agent.name),
    ]);
    if (!names.has(config.fix.agent)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fix', 'agent'],
        message: `no Agent named ${config.fix.agent}`,
      });
    }
  });

export type BootConfig = z.infer<typeof BootConfigSchema>;
export type FixConfig = z.infer<typeof FixConfigSchema>;
export type GraveshiftConfig = z.infer<typeof GraveshiftConfigSchema>;
