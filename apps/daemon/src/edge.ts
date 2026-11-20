import type { FetchHandler } from './routes';

export interface HttpListener {
  readonly port: number;
  stop(): void;
}

export interface HttpEdge {
  start(options: { port: number; fetch: FetchHandler }): HttpListener;
}

export type Serve = (options: { port: number; fetch: FetchHandler }) => {
  port: number | undefined;
  stop(closeActiveConnections?: boolean): void;
};

// Bun.serve is marked unstable. Keep it behind this boundary so the edge can be replaced.
export const makeBunEdge = (serve: Serve = (options) => Bun.serve(options)): HttpEdge => ({
  start: (options) => {
    const server = serve(options);
    return {
      port: server.port ?? options.port,
      stop: () => server.stop(true),
    };
  },
});

export const bunEdge: HttpEdge = makeBunEdge();
