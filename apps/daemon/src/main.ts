import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';

import { bunEdge } from './edge';
import { handleRequest } from './routes';

const port = Number(process.env.PORT ?? '2602');

const program = Effect.gen(function* () {
  const listener = yield* Effect.sync(() => bunEdge.start({ port, fetch: handleRequest }));
  yield* Effect.log(`daemon listening on ${listener.port}`);
  yield* Effect.never;
});

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
