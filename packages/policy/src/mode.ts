import { type Mode, MODES } from './schema';

const RANK: Record<Mode, number> = { 'dry-run': 0, propose: 1, act: 2 };

export const saferMode = (a: Mode, b: Mode): Mode => (RANK[a] <= RANK[b] ? a : b);

export function resolveMode(
  policyMode: Mode,
  envMode: string | undefined,
): { mode: Mode; warning?: string } {
  if (envMode === undefined || envMode === '') return { mode: policyMode };
  const requested = MODES.find((mode) => mode === envMode);
  if (!requested) return { mode: policyMode, warning: `invalid GRAVESHIFT_MODE ignored` };
  if (RANK[requested] > RANK[policyMode]) {
    return {
      mode: policyMode,
      warning: `GRAVESHIFT_MODE=${requested} is less safe than policy, ignored`,
    };
  }
  return { mode: requested };
}
