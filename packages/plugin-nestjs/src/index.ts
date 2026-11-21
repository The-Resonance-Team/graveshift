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
import {
  HttpException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
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
const MAX_TRACE_ID_LENGTH = 128;
const traceIdPattern = /^[A-Za-z0-9_-]+$/;

/** Drop the query string and redact any secret left in the path. */
function pathOf(request: RequestLike): string {
  const path = (request.url ?? '/').split('?')[0] ?? '/';
  return redact(path);
}

/** Collapse identifier-looking segments to keep fingerprint cardinality low. */
function routeKey(request: RequestLike): string {
  const segments = pathOf(request)
    .split('/')
    .filter(Boolean)
    .map((segment) => (/\d/.test(segment) || segment.length > 24 ? ':id' : segment));
  return `${request.method ?? 'UNKNOWN'}_${segments.join('_') || 'root'}`;
}

/**
 * Reuse a redacted, bounded incoming trace id. Generate a fresh one when the
 * header is absent or its value is not a safe token.
 */
function traceIdOf(request: RequestLike, clock: Clock): string {
  const raw = request.headers?.[TRACE_HEADER] ?? request.headers?.[TRACE_HEADER.toUpperCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return clock.newId();
  const cleaned = redact(value).slice(0, MAX_TRACE_ID_LENGTH);
  return traceIdPattern.test(cleaned) ? cleaned : clock.newId();
}

function fingerprintOf(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** Client errors are telemetry; only server and unknown errors are detection. */
function severityFor(exception: unknown): 'info' | 'critical' {
  return exception instanceof HttpException && exception.getStatus() < 500 ? 'info' : 'critical';
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
  const traceIds = new WeakMap<object, string>();

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
        traceIds.set(request, traceIdOf(request, clock));
        response.on('finish', () => {
          emit(() => {
            const path = pathOf(request);
            return {
              source: SOURCE,
              type: 'http.request',
              severity: 'info',
              traceId: traceIds.get(request) ?? traceIdOf(request, clock),
              fingerprint: fingerprintOf('http', routeKey(request)),
              payload: {
                method: request.method ?? 'UNKNOWN',
                path,
                status: response.statusCode ?? 0,
                durationMs: Date.now() - startedAt,
              },
            };
          });
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
                severity: severityFor(error),
                traceId: traceIds.get(request) ?? traceIdOf(request, clock),
                fingerprint: fingerprintOf('error', `${errorName(error)}_${routeKey(request)}`),
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
