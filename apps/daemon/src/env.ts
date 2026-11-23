import type { z } from 'zod';

export function parseDaemonEnv<Value>(
  schema: z.ZodType<Value>,
  env: Record<string, string | undefined>,
  message: string,
): Value {
  const normalized = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value === '' ? undefined : value]),
  );
  const checked = schema.safeParse(normalized);
  if (!checked.success) throw new Error(message);
  return checked.data;
}
