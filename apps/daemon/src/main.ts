import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';

import { createPrivateApi } from './api-client';
import { createAudit } from './audit';
import { configuredGateway, loadBootConfig } from './boot-config';
import { createCollectors } from './collectors';
import { createCommandHandler } from './command-handler';
import { drainCommands } from './command-lifetime';
import { parsePort, readDaemonConfig } from './config';
import { bunEdge, startListener } from './edge';
import { contextClient } from './fix-context';
import { executorFromEnv } from './fix-execution';
import { connectConsumer } from './nats';
import { createObservations } from './observations';
import { createReadHandler } from './read-handler';
import { createReadRuntime } from './reads';
import { createReadState } from './read-state';
import { createRequestHandler, daemonHandler, type FetchHandler } from './routes';
import { routingModel } from './routing-model';
import { createWorkClient } from './work-client';
import { createWorkCommands } from './work-flow';
import { workActivation } from './work-activation';

const startup = <Value>(action: () => Value, message: string) =>
  Effect.try({ try: action, catch: () => new Error(message) });
const asynchronous = <Value>(action: () => Promise<Value>, message: string) =>
  Effect.tryPromise({ try: action, catch: () => new Error(message) });

export const program = Effect.scoped(
  Effect.gen(function* () {
    const env = process.env;
    const config = yield* startup(
      () => readDaemonConfig(env),
      'Daemon transport configuration is invalid',
    );
    const api = createPrivateApi({
      origin: config.GRAVESHIFT_API_URL,
      token: config.GRAVESHIFT_API_INTERNAL_TOKEN,
      timeoutMs: config.GRAVESHIFT_API_TIMEOUT_MS,
    });
    const boot = yield* asynchronous(
      () => loadBootConfig(api, config.GRAVESHIFT_PROJECT_ID),
      'Daemon boot configuration is unavailable',
    );
    const audit = createAudit(api, config.GRAVESHIFT_PROJECT_ID);
    const gateway = yield* startup(
      () => configuredGateway(boot, audit, env),
      'Agent bindings or gateway pricing are invalid',
    );
    const executor = yield* startup(
      () => executorFromEnv(gateway, env),
      'Fix execution configuration is invalid',
    );
    const collectors = yield* startup(
      () => createCollectors(env),
      'Collector configuration is invalid',
    );
    const events = yield* Effect.acquireRelease(
      asynchronous(
        () =>
          connectConsumer({
            servers: config.GRAVESHIFT_NATS_URL,
            stream: boot.natsStream,
            projectId: boot.projectId,
          }),
        'NATS consumer is unavailable',
      ),
      (resource) => asynchronous(() => resource.stop(), 'NATS drain failed').pipe(Effect.orDie),
    );
    yield* Effect.acquireRelease(
      asynchronous(async () => {
        await collectors.start(boot.projectId, events.publisher);
        return collectors;
      }, 'Collector startup failed'),
      (resource) =>
        asynchronous(() => resource.stop(), 'Collector drain failed').pipe(Effect.orDie),
    );
    const reads = createReadRuntime({
      projectId: boot.projectId,
      api,
      sources: collectors.reads,
      metricJobs: collectors.metricJobs,
      ...(collectors.metrics === undefined ? {} : { metrics: collectors.metrics }),
    });
    const lifetime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        drainCommands(
          createWorkCommands({
            projectId: boot.projectId,
            agents: boot.agents,
            policy: boot.policy,
            runtime: createWorkClient(api),
            context: contextClient(api, boot.policy, boot.mode),
            model: routingModel(gateway),
            audit,
            execute: executor.execute,
            recover: executor.recover,
          }),
        ),
      ),
      (resource) => asynchronous(() => resource.stop(), 'Command drain failed').pipe(Effect.orDie),
    );
    const privateEdge = {
      projectId: boot.projectId,
      token: config.GRAVESHIFT_DAEMON_INTERNAL_TOKEN,
      maxBytes: config.GRAVESHIFT_BODY_MAX_BYTES,
      timeoutMs: config.GRAVESHIFT_COMMAND_TIMEOUT_MS,
    };
    const observe = yield* asynchronous(
      () =>
        createObservations({
          projectId: boot.projectId,
          api,
          gateway,
          agents: boot.agents,
          logs: (service, lines) => reads.logs(service, lines),
          onWork: workActivation(lifetime.commands, boot.projectId),
        }),
      'Observation state is unavailable',
    );
    const privateHandler = daemonHandler(
      createCommandHandler({ ...privateEdge, commands: lifetime.commands }),
      createReadHandler({ ...privateEdge, timeoutMs: config.GRAVESHIFT_API_TIMEOUT_MS, reads }),
    );
    // Keep the base read surface. It needs no third credential: the daemon's
    // internal token authenticates it just like the private command/read routes.
    const readHandler = createRequestHandler(
      createReadState(),
      config.GRAVESHIFT_DAEMON_INTERNAL_TOKEN,
    );
    const handler: FetchHandler = (request) => {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/internal/')) return privateHandler(request);
      return readHandler(request);
    };
    const address = new URL(config.GRAVESHIFT_DAEMON_URL);
    const port = yield* parsePort(process.env.PORT || address.port || undefined);
    const listener = yield* Effect.acquireRelease(
      startListener(bunEdge, {
        hostname: address.hostname.replace(/^\[|\]$/g, ''),
        port,
        fetch: handler,
        maxRequestBodySize: config.GRAVESHIFT_BODY_MAX_BYTES,
        idleTimeout: 0,
      }),
      (resource) =>
        Effect.promise(async () => {
          await resource.stop({ drain: true });
        }),
    );
    yield* Effect.log(`daemon listening on ${listener.port}`);
    yield* asynchronous(() => events.run(observe), 'NATS consumer failed');
    return yield* Effect.fail(new Error('NATS consumer stopped'));
  }),
);

if (import.meta.main) BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
