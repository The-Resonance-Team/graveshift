/** Raised when a daemon read cannot be completed. Tools propagate it and never answer with invented data. */
export class DaemonUnavailableError extends Error {
  readonly code = 'daemon_unavailable';

  constructor(cause: unknown) {
    super('the daemon read API is unavailable');
    this.name = 'DaemonUnavailableError';
    this.cause = cause;
  }
}
