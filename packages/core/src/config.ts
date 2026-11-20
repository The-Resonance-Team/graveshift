import { z } from 'zod';

import { ConfigError } from './errors';

export const ConfigSchema = z.object({
  llm: z.looseObject({
    chain: z.array(z.enum(['bedrock', 'gemini', 'ollama'])).min(1),
    timeoutMs: z.number().int().positive(),
    maxRetries: z.number().int().min(0),
  }),
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(z.prettifyError(parsed.error));
  return parsed.data;
}

// ponytail: YAML file only, no env overlay or hot reload, upgrade if deploy needs env overrides
export async function loadConfigFile(path: string): Promise<Config> {
  return parseConfig(Bun.YAML.parse(await Bun.file(path).text()));
}
