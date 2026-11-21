export const SCENARIOS = [
  'null-candy',
  'memory-leech',
  'wrong-potion',
  'slow-curse',
  'image-ghost',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const isScenario = (value: unknown): value is Scenario =>
  SCENARIOS.some((scenario) => scenario === value);

export type Env = Record<string, string | undefined>;

// wrong-potion: the fault swaps in a stale database URL, a config revert is the fix
export function resolveDatabaseUrl(env: Env, scenario: Scenario | null): string {
  if (scenario === 'wrong-potion') {
    return env.DATABASE_URL_STALE ?? 'postgres://stale:stale@postgres:5432/stale';
  }
  return env.DATABASE_URL ?? '';
}
