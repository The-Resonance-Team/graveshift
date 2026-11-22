import { ForbiddenException } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';
import type { FixResult, WorkCaller } from '@graveshift/work';

import { workItem } from '../../test/fakes/fake-fix-deps';
import {
  FIX_OUTCOME_AUDIT_TYPE,
  NO_AUDIT_SCOPE_MESSAGE,
  fixOutcomeAudit,
  fixOutcomeFromCommand,
  fixOutcomeFromTriage,
  requireFixAuditScope,
} from './fix.audit';

const caller = (overrides: Partial<WorkCaller> = {}): WorkCaller => ({
  projectId: '12345',
  actor: 'client-1',
  commandId: 'command-1',
  ...overrides,
});
const scope = { projectId: '12345', actor: 'client-1' };
const secret = 'ghp_16C7e6F4a2B9d3E8c5A1';

function result(overrides: Partial<FixResult> = {}): FixResult {
  return {
    item: workItem('work-1', { title: `OOM after ${secret}`, description: `token ${secret}` }),
    trigger: 'fix_now',
    effect: 'allow',
    ok: true,
    pr: {
      repo: 'owner/repo',
      number: 7,
      url: `https://github.test/owner/repo/pull/7?note=${secret}`,
      branch: `graveshift/fix-${secret}`,
      headSha: 'head-sha',
    },
    reason: `The upstream said ${secret}`,
    failure: 'none',
    routing: null,
    attemptId: 'attempt-1',
    ...overrides,
  };
}

describe('fix outcome audit record', () => {
  test('is one entry for one attempt, keyed by it', () => {
    expect(fixOutcomeAudit(scope, fixOutcomeFromCommand('work-1', result()))).toEqual({
      projectId: '12345',
      actor: 'client-1',
      type: FIX_OUTCOME_AUDIT_TYPE,
      key: 'fix:attempt-1:fix_now:outcome',
      payload: {
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        trigger: 'fix_now',
        effect: 'allow',
        ok: true,
        failure: 'none',
        pr: { repo: 'owner/repo', number: 7, headSha: 'head-sha' },
      },
    });
  });

  test('carries no note, title, reason text, pull request URL or branch slug', () => {
    const audit = JSON.stringify(fixOutcomeAudit(scope, fixOutcomeFromCommand('work-1', result())));
    expect(audit).not.toContain(secret);
    expect(audit).not.toContain('github.test');
    expect(audit).not.toContain('graveshift/fix');
  });

  test('records a denial by its contract code alone', () => {
    const denied = fixOutcomeAudit(
      scope,
      fixOutcomeFromCommand(
        'work-1',
        result({
          item: workItem('work-1'),
          ok: false,
          pr: null,
          effect: 'deny',
          failure: 'policy_denied',
          reason: `low_confidence because ${secret}`,
        }),
      ),
    );
    expect(denied.payload).toEqual({
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      trigger: 'fix_now',
      effect: 'deny',
      ok: false,
      failure: 'policy_denied',
    });
    expect(JSON.stringify(denied)).not.toContain(secret);
  });

  test('the automatic attempt a triage started audits its own terminal state', () => {
    expect(
      fixOutcomeAudit(
        scope,
        fixOutcomeFromTriage('work-1', {
          item: workItem('work-1'),
          autoFix: {
            ok: false,
            effect: 'deny',
            reason: `the model said ${secret}`,
            failure: 'policy_denied',
            routing: null,
            attemptId: 'attempt-1',
          },
        }),
      ),
    ).toEqual({
      projectId: '12345',
      actor: 'client-1',
      type: FIX_OUTCOME_AUDIT_TYPE,
      key: 'fix:attempt-1:auto_fix:outcome',
      payload: {
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        trigger: 'auto_fix',
        effect: 'deny',
        ok: false,
        failure: 'policy_denied',
      },
    });
  });
});

describe('fix audit scope', () => {
  test('accepts the caller that matches the bound request scope', () => {
    expect(requireFixAuditScope(caller(), scope)).toEqual(scope);
  });

  test('denies a command with no bound scope before any use case runs', () => {
    expect(() => requireFixAuditScope(caller(), undefined)).toThrow(ForbiddenException);
    expect(() => requireFixAuditScope(caller(), undefined)).toThrow(NO_AUDIT_SCOPE_MESSAGE);
  });

  test('denies a blank project or actor', () => {
    expect(() => requireFixAuditScope(caller({ projectId: ' ' }), scope)).toThrow(
      NO_AUDIT_SCOPE_MESSAGE,
    );
    expect(() => requireFixAuditScope(caller({ actor: '' }), { projectId: '', actor: '' })).toThrow(
      NO_AUDIT_SCOPE_MESSAGE,
    );
  });

  test('denies a caller that is not the bound principal', () => {
    expect(() => requireFixAuditScope(caller({ projectId: '99999' }), scope)).toThrow(
      NO_AUDIT_SCOPE_MESSAGE,
    );
    expect(() => requireFixAuditScope(caller({ actor: 'client-2' }), scope)).toThrow(
      NO_AUDIT_SCOPE_MESSAGE,
    );
  });
});
