import { BunRuntime, BunServices } from '@effect/platform-bun';
import { connectEventsConsumer } from '@graveshift/events';
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
import { createObservations } from './observations';
import { createReadHandler } from './read-handler';
import { createReadRuntime } from './reads';
import { daemonHandler, type FetchHandler } from './routes';
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
      () => loadBootConfig(api),
      'Daemon boot configuration is unavailable',
    );
    if (boot.projectIds.length === 0) {
      yield* Effect.fail(new Error('No Project is granted to this daemon'));
    }
    // This value is only a host bootstrap for Collectors and Work commands. Event
    // scope is taken from each envelope at intake (ADR 0023).
    const bootstrapProjectId = boot.projectIds[0] ?? '';
    // The audit writer holds no Project of its own: every entry is appended to the chain of the
    // scope bound for the authenticated command or Collector event that asked for it.
    const audit = createAudit(api);
    const gateway = yield* startup(
      () => configuredGateway(boot, audit, env),
      'Agent bindings or gateway pricing are invalid',
    );
    const executor = yield* startup(
      () => executorFromEnv(gateway, env, audit),
      'Fix execution configuration is invalid',
    );
    const collectors = yield* startup(
      () => createCollectors(env),
      'Collector configuration is invalid',
    );
    const events = yield* Effect.acquireRelease(
      asynchronous(
        () =>
          connectEventsConsumer({
            servers: config.GRAVESHIFT_NATS_URL,
            grantedProjectIds: boot.projectIds,
          }),
        'NATS consumer is unavailable',
      ),
      (resource) => asynchronous(() => resource.stop(), 'NATS drain failed').pipe(Effect.orDie),
    );
    yield* Effect.acquireRelease(
      asynchronous(async () => {
        await collectors.start(bootstrapProjectId, events.publisher);
        return collectors;
      }, 'Collector startup failed'),
      (resource) =>
        asynchronous(() => resource.stop(), 'Collector drain failed').pipe(Effect.orDie),
    );
    const reads = createReadRuntime({
      api,
      sources: collectors.reads,
      metricJobs: collectors.metricJobs,
      ...(collectors.metrics === undefined ? {} : { metrics: collectors.metrics }),
    });
    const lifetime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        drainCommands(
          createWorkCommands({
            projectIds: boot.projectIds,
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
      projectIds: boot.projectIds,
      token: config.GRAVESHIFT_DAEMON_INTERNAL_TOKEN,
      maxBytes: config.GRAVESHIFT_BODY_MAX_BYTES,
      timeoutMs: config.GRAVESHIFT_COMMAND_TIMEOUT_MS,
    };
    const observe = yield* asynchronous(
      () =>
        createObservations({
          api,
          gateway,
          agents: boot.agents,
          logs: (service, lines, projectId) => reads.logs(projectId, service, lines),
          onWork: (item, incidentId, eventProjectId) =>
            workActivation(lifetime.commands, eventProjectId)(item, incidentId),
        }),
      'Observation state is unavailable',
    );
    const privateHandler = daemonHandler(
      createCommandHandler({ ...privateEdge, commands: lifetime.commands }),
      createReadHandler({
        token: privateEdge.token,
        maxBytes: privateEdge.maxBytes,
        projectIds: boot.projectIds,
        timeoutMs: config.GRAVESHIFT_API_TIMEOUT_MS,
        reads,
      }),
    );
    // One private handler carries every command and read; health alone is public.
    const handler: FetchHandler = privateHandler;
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
