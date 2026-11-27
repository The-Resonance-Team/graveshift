export const GRAVESHIFT_CONFIG = Symbol('GRAVESHIFT_CONFIG');

// Deep freeze a boot value so a later code path cannot change what a route serves.
// ESM runs in strict mode, so a mutation attempt throws instead of passing silently.
export function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}
