import type { AuditEvent } from '@graveshift/gateway';

/**
 * In-process spend accumulator fed by gateway audit callbacks. The policy
 * engine compares it against the daily budget before a model call. The daemon
 * usage API (ticket #48) has no writers yet, so the ledger lives here.
 * ponytail: process-local ledger; upgrade if #48 daemon read API exposes a durable usage counter
 */
export class SpendTracker {
  private day = '';
  private spent = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** The gateway `onAudit` sink: every terminal call reports its cost. */
  record(event: AuditEvent): void {
    const day = this.currentDay();
    if (day !== this.day) {
      this.day = day;
      this.spent = 0;
    }
    if (event.costUsd > 0) this.spent += event.costUsd;
  }

  spendTodayUsd(): number {
    const day = this.currentDay();
    if (day !== this.day) {
      this.day = day;
      this.spent = 0;
    }
    return this.spent;
  }

  // The same UTC day key the gateway budget ledger uses.
  private currentDay(): string {
    return this.now().toISOString().slice(0, 10);
  }
}
