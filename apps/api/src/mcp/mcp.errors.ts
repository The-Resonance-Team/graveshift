export type DaemonErrorCode = 'daemon_unavailable' | 'daemon_auth';

/** Raised when a daemon read cannot be completed. Tools propagate it and never answer with invented data. */
export class DaemonUnavailableError extends Error {
  constructor(
    cause: unknown,
    readonly code: DaemonErrorCode = 'daemon_unavailable',
  ) {
    super('the daemon read API is unavailable');
    this.name = 'DaemonUnavailableError';
    this.cause = cause;
  }
}
