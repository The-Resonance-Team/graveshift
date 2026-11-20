import { Data, Effect } from 'effect';

export const DEFAULT_PORT = 2602;

export class InvalidPort extends Data.TaggedError('InvalidPort')<{
  readonly value: string;
  readonly message: string;
}> {}

export const parsePort = (raw: string | undefined): Effect.Effect<number, InvalidPort> => {
  const value = raw ?? String(DEFAULT_PORT);
  const fail = () => Effect.fail(new InvalidPort({ value, message: `Invalid PORT: ${value}` }));
  if (!/^\d+$/.test(value)) return fail();
  const port = Number(value);
  if (port < 1 || port > 65535) return fail();
  return Effect.succeed(port);
};
