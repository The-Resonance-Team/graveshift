import {
  type Clock,
  type Context,
  envelopeBuilder,
  type EventDetails,
  type Integration,
  systemClock,
  validateContext,
} from '@graveshift/integrations';
import { redact } from '@graveshift/redactor';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { catchError, throwError, type Observable } from 'rxjs';

/** The Nest application surface the plugin needs. A real INestApplication fits it. */
export interface GraveshiftApp {
  use(...args: unknown[]): unknown;
  useGlobalInterceptors(...interceptors: NestInterceptor[]): unknown;
}

interface RequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  readonly statusCode?: number;
  on(event: string, listener: () => void): unknown;
}

type NextLike = (error?: unknown) => void;

const SOURCE = 'nestjs_plugin';
const TRACE_HEADER = 'x-trace-id';

/** Drop the query string and redact any secret left in the path. */
function pathOf(request: RequestLike): string {
  const path = (request.url ?? '/').split('?')[0] ?? '/';
  return redact(path);
}

/** Reuse an incoming trace id; generate one only when the header is absent. */
function traceIdOf(request: RequestLike, clock: Clock): string {
  const raw = request.headers?.[TRACE_HEADER] ?? request.headers?.[TRACE_HEADER.toUpperCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : clock.newId();
}

function fingerprintOf(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function errorName(exception: unknown): string {
  return exception instanceof Error ? exception.constructor.name : 'UnknownError';
}

function errorMessage(exception: unknown): string {
  const message = exception instanceof Error ? exception.message : String(exception);
  return redact(message);
}

/**
 * Create the NestJS Plugin. Importing this module has no side effects; the
 * returned Integration observes requests only after start() is called.
 */
export function init(app: GraveshiftApp, clock: Clock = systemClock): Integration {
  let generation = 0;
  let active = false;

  return {
    name: 'nestjs',
    kind: 'plugin',
    start(context: Context) {
      validateContext(context);
      const token = ++generation;
      active = true;
      const isCurrent = () => active && token === generation;

      const build = envelopeBuilder(context, clock);
      const emit = (makeDetails: () => EventDetails): void => {
        if (!isCurrent()) return;
        try {
          const envelope = build(makeDetails());
          void Promise.resolve(context.publisher.publish(envelope)).catch(() => {
            // Fail open: publishing must never break the host request.
          });
        } catch {
          // Fail open: a bad envelope must never break the host request.
        }
      };

      const middleware = (request: RequestLike, response: ResponseLike, next: NextLike): void => {
        const startedAt = Date.now();
        const path = pathOf(request);
        response.on('finish', () => {
          emit(() => ({
            source: SOURCE,
            type: 'http.request',
            severity: 'info',
            traceId: traceIdOf(request, clock),
            fingerprint: fingerprintOf('http', `${request.method ?? 'UNKNOWN'}_${path}`),
            payload: {
              method: request.method ?? 'UNKNOWN',
              path,
              status: response.statusCode ?? 0,
              durationMs: Date.now() - startedAt,
            },
          }));
        });
        next();
      };

      const interceptor: NestInterceptor = {
        intercept(host: ExecutionContext, next: CallHandler): Observable<unknown> {
          const request = host.switchToHttp().getRequest<RequestLike>();
          return next.handle().pipe(
            // Publish and rethrow. Nest's exception layer still writes the response.
            catchError((error: unknown) => {
              emit(() => ({
                source: SOURCE,
                type: 'http.error',
                severity: 'critical',
                traceId: traceIdOf(request, clock),
                fingerprint: fingerprintOf('error', errorName(error)),
                payload: {
                  method: request.method ?? 'UNKNOWN',
                  path: pathOf(request),
                  message: errorMessage(error),
                },
              }));
              return throwError(() => error);
            }),
          );
        },
      };

      app.use(middleware);
      app.useGlobalInterceptors(interceptor);
    },
    // ponytail: stop only disables publishing; upgrade if Nest exposes observer removal and stop must detach them.
    stop() {
      active = false;
    },
  };
}
