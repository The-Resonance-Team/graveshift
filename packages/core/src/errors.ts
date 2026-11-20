export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });

export class GraveshiftError<C extends string = string> extends Error {
  readonly code: C;

  constructor(code: C, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export type TransitionErrorCode = 'ILLEGAL_TRANSITION' | 'GUARD_FAILED';

export class TransitionError extends GraveshiftError<TransitionErrorCode> {}

export class ConfigError extends GraveshiftError {
  constructor(message: string) {
    super('CONFIG_INVALID', message);
  }
}
