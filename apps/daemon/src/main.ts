import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';

import { parsePort, parseReadToken } from './config';
import { bunEdge, startListener } from './edge';
import { createReadState } from './read-state';
import { createRequestHandler } from './routes';

const program = Effect.scoped(
  Effect.gen(function* () {
    const port = yield* parsePort(process.env.PORT);
    const readToken = yield* parseReadToken(process.env.GRAVESHIFT_DAEMON_READ_TOKEN);
    const listener = yield* Effect.acquireRelease(
      startListener(bunEdge, { port, fetch: createRequestHandler(createReadState(), readToken) }),
      (acquired) => Effect.sync(() => acquired.stop({ drain: true })),
    );
    yield* Effect.log(`daemon listening on ${listener.port}`);
    yield* Effect.never;
  }),
);

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
