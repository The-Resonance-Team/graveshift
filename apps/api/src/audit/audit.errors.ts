export class AuditConflict extends Error {
  readonly code = 'AUDIT_KEY_CONFLICT';

  constructor() {
    super('The audit key already identifies different facts.');
  }
}

export class AuditBusy extends Error {
  readonly code = 'AUDIT_RETRY_EXHAUSTED';

  constructor(cause: unknown) {
    super('The audit transaction could not finish after retries.', { cause });
  }
}

export class AuditCountersUnavailable extends Error {
  readonly code = 'AUDIT_COUNTERS_UNAVAILABLE';

  constructor() {
    super('Audit usage cannot be established from the recorded facts.');
  }
}
