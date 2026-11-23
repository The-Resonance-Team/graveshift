import type { PrRef } from '@graveshift/core';
import { FixerFault, PublicationError } from '@graveshift/fixer';
import type {
  ClaimResult,
  FixCompletion,
  FixResult,
  RoutingOutcome,
  WorkCaller,
  WorkSnapshot,
} from '@graveshift/work';

import { auditScopeOfCaller, fixAuditIdentity, fixPrIntentAudit } from './fix-audit';
import type { PreparedFix } from './execution';
import type { FixOptions } from './run-fix';

export async function publishFix(
  options: FixOptions,
  caller: WorkCaller,
  claim: Extract<ClaimResult, { kind: 'claimed' }>,
  prepared: PreparedFix,
  routing: RoutingOutcome,
  signal?: AbortSignal,
): Promise<FixResult> {
  let snapshot = claim.snapshot;
  let attempt = claim.attempt;
  let known: PrRef | null = null;
  let begun = false;
  const id = snapshot.item.id;
  const fence = () => ({
    expectedVersion: snapshot.version,
    attemptId: attempt.id,
    attemptVersion: attempt.version,
  });
  const adopt = (next: WorkSnapshot) => {
    const active = next.activeAttempt;
    if (active === undefined || active.id !== attempt.id)
      throw new Error('Publication attempt changed');
    snapshot = next;
    attempt = active;
  };
  try {
    signal?.throwIfAborted();
    // The pre-side-effect entry: it is appended before any GitHub call, so a sink failure
    // stops the Fix with no outside effect and no saved publication intent. The API writes the
    // matching `fix.outcome` entry after the attempt returns.
    const scope = auditScopeOfCaller(caller);
    await options.audit(
      fixPrIntentAudit(fixAuditIdentity(scope, snapshot.item, attempt), prepared.intent),
      scope,
    );
    adopt(
      await options.runtime.beginPublication(caller, id, { ...fence(), intent: prepared.intent }),
    );
    begun = true;
    signal?.throwIfAborted();
    known = await prepared.publish();
    adopt(
      await options.runtime.recordPublication(caller, id, {
        ...fence(),
        pr: known,
        baseSha: prepared.intent.baseSha,
      }),
    );
    return await options.runtime.finish(caller, id, {
      ...fence(),
      state: 'completed',
      outcome: { effect: 'allow', ok: true, pr: known, reason: null, failure: 'none', routing },
    });
  } catch (error) {
    if (error instanceof PublicationError && error.reference !== undefined) known = error.reference;
    if (!begun) {
      return options.runtime.finish(caller, id, {
        ...fence(),
        state: 'failed',
        outcome: {
          effect: 'deny',
          ok: false,
          pr: null,
          reason: 'Publication admission failed',
          failure: 'audit_failed',
          routing,
        },
      });
    }
    if (
      known === null &&
      ((error instanceof PublicationError && !error.uncertain) || error instanceof FixerFault)
    ) {
      return options.runtime.abortPublication(caller, id, {
        ...fence(),
        outcome: {
          effect: 'deny',
          ok: false,
          pr: null,
          reason: error.message,
          failure: 'pr_failed',
          routing,
        },
      });
    }
    // A lost response may follow a committed write. Read the current fence before recovery.
    try {
      const fresh = await options.runtime.read({ projectId: caller.projectId, id });
      if (fresh.activeAttempt?.id === attempt.id) adopt(fresh);
      if (known !== null && fresh.item.draftPr === null) {
        adopt(
          await options.runtime.recordPublication(caller, id, {
            ...fence(),
            pr: known,
            baseSha: prepared.intent.baseSha,
          }),
        );
      }
    } catch {
      // The saved intent blocks another publication while the API is unavailable.
    }
    const outcome: FixCompletion = {
      effect: 'allow',
      ok: false,
      pr: snapshot.item.draftPr ?? known,
      reason: 'Publication needs reconciliation',
      failure: 'publication_uncertain',
      routing,
    };
    try {
      return await options.runtime.finish(caller, id, { ...fence(), state: 'uncertain', outcome });
    } catch {
      return {
        ...outcome,
        item: { ...snapshot.item, draftPr: outcome.pr },
        trigger: attempt.trigger,
        attemptId: attempt.id,
      };
    }
  } finally {
    try {
      await prepared.dispose();
    } catch {
      // Cleanup cannot discard the known result of a GitHub write.
    }
  }
}
