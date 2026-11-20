import { Data, Effect } from 'effect';

import type { FetchHandler } from './routes';

export const DEFAULT_HOSTNAME = '127.0.0.1';

export interface StopOptions {
  readonly drain?: boolean;
}

export interface HttpListener {
  readonly port: number;
  stop(options?: StopOptions): void;
}

export interface StartOptions {
  readonly port: number;
  readonly hostname?: string;
  readonly fetch: FetchHandler;
}

export interface HttpEdge {
  start(options: StartOptions): HttpListener;
}

export type Serve = (options: { port: number; hostname: string; fetch: FetchHandler }) => {
  port: number | undefined;
  stop(closeActiveConnections?: boolean): void;
};

export class HttpEdgeStartError extends Data.TaggedError('HttpEdgeStartError')<{
  readonly cause: unknown;
  readonly message: string;
}> {}

export const startListener = (edge: HttpEdge, options: StartOptions) =>
  Effect.try({
    try: () => edge.start(options),
    catch: (cause) =>
      new HttpEdgeStartError({ cause, message: `HTTP edge failed to start: ${String(cause)}` }),
  });

// Bun.serve is marked unstable. Keep it behind this boundary so the edge can be replaced.
export const makeBunEdge = (serve: Serve = (options) => Bun.serve(options)): HttpEdge => ({
  start: ({ hostname = DEFAULT_HOSTNAME, ...options }) => {
    const server = serve({ ...options, hostname });
    return {
      port: server.port ?? options.port,
      // Bun closes active connections only when drain is false.
      stop: ({ drain = true } = {}) => server.stop(!drain),
    };
  },
});

export const bunEdge: HttpEdge = makeBunEdge();
