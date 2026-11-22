import { WorkError, type FixResult, type TriageResult, type WorkCaller } from '@graveshift/work';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import { workItem } from '../../test/fakes/fake-fix-deps';
import { withAuditScope } from '../audit/audit.sink';
import { InMemoryAuditSink } from '../audit/testing/in-memory-audit.sink';
import { AuditedWorkCommands } from './audited-work.commands';

const SECRET = 'ghp_16C7e6F4a2B9d3E8c5A1';

const open: FixResult = {
  item: workItem('work-1', { title: `OOM after ${SECRET}` }),
  trigger: 'fix_now',
  effect: 'allow',
  ok: true,
  pr: {
    repo: 'owner/repo',
    number: 7,
    url: `https://github.test/owner/repo/pull/7?n=${SECRET}`,
    branch: `graveshift/${SECRET}`,
    headSha: 'head-sha',
  },
  reason: `GitHub said ${SECRET}`,
  failure: 'none',
  routing: null,
  attemptId: 'attempt-1',
};

const completed = (): FixResult => structuredClone(open);

/**
 * One independent boundary per call: its own sink, its own daemon call log and its own reply.
 * Nothing is shared between two fixtures, so a test of two Projects proves separation by
 * construction rather than by the order the tests happen to run in.
 */
function boundary(options: {
  readonly projectId: string;
  readonly clientId: string;
  readonly reply?: () => Promise<FixResult>;
  readonly triage?: () => Promise<TriageResult>;
  readonly audit?: InMemoryAuditSink;
}) {
  const calls: string[] = [];
  const reply = options.reply ?? (async () => completed());
  const inner = {
    async fixNow(caller: WorkCaller, id: string): Promise<FixResult> {
      calls.push(`daemon:${caller.projectId}:${id}`);
      return reply();
    },
    async answer(caller: WorkCaller, id: string): Promise<FixResult> {
      calls.push(`daemon:${caller.projectId}:${id}`);
      return reply();
    },
    async triage(caller: WorkCaller, id: string): Promise<TriageResult> {
      calls.push(`daemon:${caller.projectId}:${id}`);
      return (options.triage ?? (async () => ({ item: workItem(id), autoFix: null })))();
    },
  };
  const audit = options.audit ?? new InMemoryAuditSink();
  const commands = new AuditedWorkCommands(inner, audit);
  const caller = (commandId = 'command-1'): WorkCaller => ({
    projectId: options.projectId,
    actor: options.clientId,
    commandId,
  });
  const run = <Value>(work: () => Promise<Value>): Promise<Value> =>
    withAuditScope({ projectId: options.projectId, actor: options.clientId }, work);
  return { calls, audit, caller, commands, run };
}

describe('audited fix commands', () => {
  test('writes the one outcome entry after the daemon call, never before it', async () => {
    // Observed from inside the daemon call: the attempt is not yet audited while the draft
    // pull request is still being made, and audited exactly once after the result returned.
    const seen: number[] = [];
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      reply: async () => {
        seen.push(fix.audit.projects().length);
        return completed();
      },
    });
    const result = await fix.run(() =>
      fix.commands.fixNow(fix.caller(), 'work-1', { note: 'check memory' }),
    );
    expect(result.ok).toBe(true);
    expect(seen).toEqual([0]);
    expect(fix.calls).toEqual(['daemon:12345:work-1']);
    expect(fix.audit.entries('12345').map((entry) => entry.type)).toEqual(['fix.outcome']);
    expect(fix.audit.entries('12345')[0]).toMatchObject({
      projectId: '12345',
      actor: 'client-1',
      payload: { workItemId: 'work-1', ok: true, failure: 'none' },
    });
  });

  test('a replay of the same command audits the attempt once', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await fix.run(() => fix.commands.fixNow(fix.caller('command-1'), 'work-1', {}));
    await fix.run(() => fix.commands.fixNow(fix.caller('command-1'), 'work-1', {}));
    expect(fix.audit.ofType('fix.outcome')).toHaveLength(1);
  });

  test('two OAuth clients of different Projects write to different chains', async () => {
    const first = boundary({ projectId: '12345', clientId: 'client-1' });
    const second = boundary({ projectId: '12346', clientId: 'client-2' });
    await first.run(() => first.commands.fixNow(first.caller(), 'work-1', {}));
    await second.run(() => second.commands.fixNow(second.caller(), 'work-2', {}));

    expect(first.audit.projects()).toEqual(['12345']);
    expect(second.audit.projects()).toEqual(['12346']);
    expect(first.audit.entries('12345').map((entry) => entry.actor)).toEqual(['client-1']);
    expect(second.audit.entries('12346').map((entry) => entry.actor)).toEqual(['client-2']);
    expect(first.audit.entries('12346')).toEqual([]);
    expect(second.audit.entries('12345')).toEqual([]);
    expect(first.calls).toEqual(['daemon:12345:work-1']);
    expect(second.calls).toEqual(['daemon:12346:work-2']);
  });

  test('a command outside an authenticated scope is denied before the daemon is called', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await expect(fix.commands.fixNow(fix.caller(), 'work-1', {})).rejects.toMatchObject({
      status: 403,
      message: 'The request has no authenticated audit scope',
    });
    // No daemon call means no policy gate, no model call and no GitHub call downstream.
    expect(fix.calls).toEqual([]);
    expect(fix.audit.projects()).toEqual([]);
  });

  test('a forged caller is denied before the daemon is called', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await expect(
      fix.run(() => fix.commands.fixNow({ ...fix.caller(), projectId: '99999' }, 'work-1', {})),
    ).rejects.toMatchObject({ status: 403 });
    expect(fix.calls).toEqual([]);
    expect(fix.audit.projects()).toEqual([]);
  });

  test('a blank authenticated project is denied before the daemon is called', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await expect(
      fix.run(() => fix.commands.fixNow({ ...fix.caller(), projectId: '  ' }, 'work-1', {})),
    ).rejects.toMatchObject({ status: 403 });
    expect(fix.calls).toEqual([]);
  });

  test('a note with a secret never enters an audit payload', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await fix.run(() =>
      fix.commands.fixNow(fix.caller(), 'work-1', { note: `rotate ${SECRET} now` }),
    );
    expect(JSON.stringify(fix.audit.entries('12345'))).not.toContain(SECRET);
  });

  test('a command the daemon rejected writes no outcome entry', async () => {
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      reply: async () => {
        throw new WorkError('MANUAL_ASSIGNMENT', 'A person must fix this Work item');
      },
    });
    await expect(
      fix.run(() => fix.commands.fixNow(fix.caller(), 'work-1', {})),
    ).rejects.toMatchObject({ code: 'MANUAL_ASSIGNMENT' });
    expect(fix.audit.projects()).toEqual([]);
  });

  test('withholds the result and fails closed when the outcome audit is unavailable', async () => {
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      audit: new InMemoryAuditSink({ failWith: new Error('chain unavailable') }),
    });
    await expect(
      fix.run(() => fix.commands.fixNow(fix.caller(), 'work-1', {})),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fix.calls).toEqual(['daemon:12345:work-1']);
    expect(fix.audit.entries('12345')).toEqual([]);
  });

  test('an answer that resumes an attempt audits its own outcome', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await fix.run(() =>
      fix.commands.answer(fix.caller('command-2'), 'work-1', {
        attemptId: 'attempt-1',
        questionId: 'question-1',
        params: { INCIDENT: 'OOM' },
      }),
    );
    expect(fix.audit.entries('12345').map((entry) => entry.key)).toEqual([
      'fix:attempt-1:fix_now:outcome',
    ]);
  });

  test('a triage that starts no attempt writes no outcome entry', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1' });
    await fix.run(() => fix.commands.triage(fix.caller(), 'work-1', { assignee: 'needs_human' }));
    expect(fix.audit.projects()).toEqual([]);
  });

  test('a triage that starts the automatic trigger audits that attempt', async () => {
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      triage: async () => ({
        item: structuredClone(open.item),
        autoFix: {
          ok: false,
          effect: 'deny',
          reason: `low_confidence ${SECRET}`,
          failure: 'policy_denied',
          routing: null,
          attemptId: 'attempt-1',
        },
      }),
    });
    await fix.run(() =>
      fix.commands.triage(fix.caller(), 'work-1', { assignee: 'needs_agent_SRE Agent' }),
    );
    expect(fix.audit.entries('12345').map((entry) => entry.type)).toEqual(['fix.outcome']);
  });
});
