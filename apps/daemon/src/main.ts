import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';

import { parsePort } from './config';
import { bunEdge, startListener } from './edge';
import { handleRequest } from './routes';

const program = Effect.scoped(
  Effect.gen(function* () {
    const port = yield* parsePort(process.env.PORT);
    const listener = yield* Effect.acquireRelease(
      startListener(bunEdge, { port, fetch: handleRequest }),
      (acquired) => Effect.sync(() => acquired.stop({ drain: true })),
    );
    yield* Effect.log(`daemon listening on ${listener.port}`);
    yield* Effect.never;
  }),
);

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
