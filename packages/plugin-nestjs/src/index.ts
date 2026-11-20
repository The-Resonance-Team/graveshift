import type { EventEnvelope } from '@graveshift/core';
import {
  type Clock,
  type Context,
  envelopeBuilder,
  type EventDetails,
  type Integration,
  systemClock,
} from '@graveshift/integrations';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';

/** The Nest application surface the plugin needs. A real INestApplication fits it. */
export interface GraveshiftApp {
  use(...args: unknown[]): unknown;
  useGlobalFilters(...filters: ExceptionFilter[]): unknown;
}

interface RequestLike {
  readonly method?: string;
  readonly url?: string;
}

interface ResponseLike {
  readonly statusCode?: number;
  on(event: string, listener: () => void): unknown;
}

type NextLike = (error?: unknown) => void;

const SOURCE = 'nestjs_plugin';

/**
 * Create the NestJS Plugin. Importing this module has no side effects; the
 * returned Integration observes requests only after start() is called.
 */
export function init(app: GraveshiftApp, clock: Clock = systemClock): Integration {
  let active = false;

  return {
    name: 'nestjs',
    kind: 'plugin',
    start(context: Context) {
      if (active) return;
      active = true;

      const build = envelopeBuilder(context, clock);
      const publish = (details: EventDetails): void => {
        if (!active) return;
        const envelope: EventEnvelope = build(details);
        void context.publisher.publish(envelope).catch((error: unknown) => {
          console.error('Graveshift plugin publish failed', error);
        });
      };

      const middleware = (req: RequestLike, res: ResponseLike, next: NextLike): void => {
        const startedAt = Date.now();
        res.on('finish', () => {
          publish({
            source: SOURCE,
            type: 'http.request',
            severity: 'info',
            traceId: clock.newId(),
            fingerprint: 'http_request',
            payload: {
              method: req.method ?? 'UNKNOWN',
              path: req.url ?? '/',
              status: res.statusCode ?? 0,
              durationMs: Date.now() - startedAt,
            },
          });
        });
        next();
      };

      const filter: ExceptionFilter = {
        catch(exception: unknown, host: ArgumentsHost) {
          const request = host.switchToHttp().getRequest<RequestLike>();
          publish({
            source: SOURCE,
            type: 'http.error',
            severity: 'critical',
            traceId: clock.newId(),
            fingerprint: 'unhandled_error',
            payload: {
              method: request.method ?? 'UNKNOWN',
              path: request.url ?? '/',
              message: exception instanceof Error ? exception.message : String(exception),
            },
          });
        },
      };

      app.use(middleware);
      app.useGlobalFilters(filter);
    },
    // ponytail: stop only disables publishing; upgrade if Nest exposes observer removal and stop must detach them.
    stop() {
      active = false;
    },
  };
}
