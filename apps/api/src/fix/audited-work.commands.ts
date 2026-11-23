import {
  type AnswerBody,
  type FixNowBody,
  type FixResult,
  type TriageBody,
  type TriageResult,
  type WorkCaller,
  type WorkCommands,
} from '@graveshift/work';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  AUDIT_SINK,
  currentAuditScope,
  type AuditScope,
  type AuditSink,
} from '../audit/audit.sink';
import {
  fixOutcomeAudit,
  fixOutcomeFromCommand,
  fixOutcomeFromTriage,
  requireFixAuditScope,
  type FixAuditOutcome,
} from './fix.audit';

/**
 * The command surface the audited commands wrap: `DaemonWorkClient` in production, an
 * in-memory adapter in a test. It is a separate token so a test keeps the audit writer and
 * replaces only the transport to the daemon.
 */
export const WORK_COMMANDS_INNER = Symbol('WORK_COMMANDS_INNER');

/** The audit failure a caller sees when the outcome entry cannot be made durable. */
const AUDIT_FAILED = { code: 'audit_failed', message: 'The Fix outcome audit is unavailable' };

/**
 * The Fix command boundary. Every Fix attempt runs under the authenticated audit scope the
 * verified OAuth principal carries, so the attempt is denied before the daemon is called when
 * that scope is missing: no store read, no policy gate, no model call and no GitHub call
 * happens on a request nobody can attribute.
 *
 * One `fix.outcome` entry per attempt is written after the daemon call returns, so after the
 * draft pull request call. The pre-side-effect `fix.pr_intent` entry is the daemon's, written
 * before that call. A failed append withholds the result and fails closed: the caller retries
 * with the same command id and the recorded result is audited once.
 */
@Injectable()
export class AuditedWorkCommands implements WorkCommands {
  constructor(
    @Inject(WORK_COMMANDS_INNER) private readonly inner: WorkCommands,
    @Inject(AUDIT_SINK) private readonly sink: AuditSink,
  ) {}

  async triage(caller: WorkCaller, id: string, body: TriageBody): Promise<TriageResult> {
    const scope = requireFixAuditScope(caller, currentAuditScope());
    const result = await this.inner.triage(caller, id, body);
    // A triage that starts the configured automatic trigger owns one Fix attempt too.
    if (result.autoFix !== null) await this.record(scope, fixOutcomeFromTriage(caller, id, result));
    return result;
  }

  async fixNow(caller: WorkCaller, id: string, body: FixNowBody): Promise<FixResult> {
    const scope = requireFixAuditScope(caller, currentAuditScope());
    const result = await this.inner.fixNow(caller, id, body);
    await this.record(scope, fixOutcomeFromCommand(caller, id, result));
    return result;
  }

  async answer(caller: WorkCaller, id: string, body: AnswerBody): Promise<FixResult> {
    const scope = requireFixAuditScope(caller, currentAuditScope());
    const result = await this.inner.answer(caller, id, body);
    await this.record(scope, fixOutcomeFromCommand(caller, id, result));
    return result;
  }

  /** The one audit event for one attempt, written only after the daemon call returned. */
  private async record(scope: AuditScope, outcome: FixAuditOutcome): Promise<void> {
    try {
      await this.sink.append(fixOutcomeAudit(scope, outcome));
    } catch {
      throw new ServiceUnavailableException(AUDIT_FAILED);
    }
  }
}
