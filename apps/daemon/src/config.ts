import { Data, Effect } from 'effect';

export const DEFAULT_PORT = 2602;

export class InvalidPort extends Data.TaggedError('InvalidPort')<{
  readonly value: string;
  readonly message: string;
}> {}

export class MissingReadToken extends Data.TaggedError('MissingReadToken')<{
  readonly message: string;
}> {}

/** The deployment-local read token has no default. Boot fails closed without it. */
export const parseReadToken = (
  raw: string | undefined,
): Effect.Effect<string, MissingReadToken> => {
  if (raw === undefined || raw.length === 0) {
    return Effect.fail(
      new MissingReadToken({ message: 'GRAVESHIFT_DAEMON_READ_TOKEN must be set' }),
    );
  }
  return Effect.succeed(raw);
};

export const parsePort = (raw: string | undefined): Effect.Effect<number, InvalidPort> => {
  const value = raw ?? String(DEFAULT_PORT);
  const fail = () => Effect.fail(new InvalidPort({ value, message: `Invalid PORT: ${value}` }));
  if (!/^\d+$/.test(value)) return fail();
  const port = Number(value);
  if (port < 1 || port > 65535) return fail();
  return Effect.succeed(port);
};
