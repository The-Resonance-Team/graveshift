import { WorkError, type FixResult, type TriageResult, type WorkCaller } from '@graveshift/work';
import { describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../test/database/fixtures';
import { workItem } from '../../test/fakes/fake-fix-deps';
import { setupWorkHttpDatabase } from '../work-items/testing/work-http.fixture';
import { currentAuditScope, withAuditScope, type AuditScope } from '../audit/audit.sink';
import { AuditedWorkCommands } from './audited-work.commands';

const SECRET = 'fake-ghp-token';

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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One independent boundary per call: its own daemon log and reply. Two Projects share only the
 * durable audit chain, so separation is proved by that chain, not by test order. A test can give
 * each boundary its own delay and a shared timeline, so two clients genuinely overlap.
 */
function boundary(options: {
  readonly projectId: string;
  readonly clientId: string;
  readonly reply?: () => Promise<FixResult>;
  readonly triage?: () => Promise<TriageResult>;
  /** How long the fake daemon stays inside the call, so two calls really overlap. */
  readonly delayMs?: number;
  /** Shared order record: start and done per call, to prove interleaving, not timing luck. */
  readonly timeline?: string[];
  /** The audit scope each call sees while it runs: its own request scope or nothing. */
  readonly seenScopes?: Array<{ tag: string; scope: AuditScope | undefined }>;
  /** The real audit adapter the suite opened. */
  readonly audit: ReturnType<typeof setupWorkHttpDatabase>['audit'];
}) {
  const calls: string[] = [];
  const reply = options.reply ?? (async () => structuredClone(open));
  const enter = (tag: string, caller: WorkCaller, id: string) => {
    options.timeline?.push(`${tag}:start`);
    options.seenScopes?.push({ tag, scope: currentAuditScope() });
    calls.push(`daemon:${caller.projectId}:${id}`);
  };
  const inner = {
    async fixNow(caller: WorkCaller, id: string): Promise<FixResult> {
      enter(`fix-now:${options.projectId}`, caller, id);
      if (options.delayMs !== undefined) await sleep(options.delayMs);
      options.timeline?.push(`fix-now:${options.projectId}:done`);
      return reply();
    },
    async answer(caller: WorkCaller, id: string): Promise<FixResult> {
      enter(`answer:${options.projectId}`, caller, id);
      if (options.delayMs !== undefined) await sleep(options.delayMs);
      options.timeline?.push(`answer:${options.projectId}:done`);
      return reply();
    },
    async triage(caller: WorkCaller, id: string): Promise<TriageResult> {
      enter(`triage:${options.projectId}`, caller, id);
      if (options.delayMs !== undefined) await sleep(options.delayMs);
      options.timeline?.push(`triage:${options.projectId}:done`);
      return (options.triage ?? (async () => ({ item: workItem(id), autoFix: null })))();
    },
  };
  const commands = new AuditedWorkCommands(inner, options.audit);
  const caller = (commandId = 'command-1'): WorkCaller => ({
    projectId: options.projectId,
    actor: options.clientId,
    commandId,
  });
  const run = <Value>(work: () => Promise<Value>): Promise<Value> =>
    withAuditScope({ projectId: options.projectId, actor: options.clientId }, work);
  return { calls, audit: options.audit, caller, commands, run };
}

describe.skipIf(!dbTestEnabled)('audited fix commands', () => {
  const fixture = setupWorkHttpDatabase();
  const projects = async (): Promise<string[]> => {
    const rows = await fixture.db.auditEntry.findMany({ select: { projectId: true } });
    return [...new Set(rows.map((row) => row.projectId))].sort();
  };
  const entries = (projectId: string) => fixture.audit.list(projectId);

  test('writes the one outcome entry after the daemon call, never before it', async () => {
    // Observed from inside the daemon call: the attempt is not yet audited while the draft
    // pull request is still being made, and audited exactly once after the result returned.
    const seen: number[] = [];
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      audit: fixture.audit,
      reply: async () => {
        seen.push(await fixture.db.auditEntry.count());
        return structuredClone(open);
      },
    });
    const result = await fix.run(() =>
      fix.commands.fixNow(fix.caller(), 'work-1', { note: 'check memory' }),
    );
    expect(result.ok).toBe(true);
    expect(seen).toEqual([0]);
    expect(fix.calls).toEqual(['daemon:12345:work-1']);
    expect((await entries('12345')).map((entry) => entry.type)).toEqual(['fix.outcome']);
    expect((await entries('12345'))[0]).toMatchObject({
      actor: 'client-1',
      payload: { workItemId: 'work-1', ok: true, failure: 'none' },
    });
  });

  test('a replay of the same command audits the attempt once', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await fix.run(() => fix.commands.fixNow(fix.caller('command-1'), 'work-1', {}));
    await fix.run(() => fix.commands.fixNow(fix.caller('command-1'), 'work-1', {}));
    expect((await entries('12345')).filter((entry) => entry.type === 'fix.outcome')).toHaveLength(
      1,
    );
  });

  test('two concurrent OAuth clients of different Projects write to different chains', async () => {
    // Both commands are in flight at once: the quick one returns while the slow one is still
    // inside the daemon, so every audit write below races the other request on purpose.
    const timeline: string[] = [];
    const seenScopes: Array<{ tag: string; scope: AuditScope | undefined }> = [];
    const first = boundary({
      projectId: '12345',
      clientId: 'client-1',
      audit: fixture.audit,
      delayMs: 40,
      timeline,
      seenScopes,
    });
    const second = boundary({
      projectId: '12346',
      clientId: 'client-2',
      audit: fixture.audit,
      delayMs: 5,
      timeline,
      seenScopes,
    });
    const [slow, quick] = await Promise.all([
      first.run(() => first.commands.fixNow(first.caller(), 'work-1', {})),
      second.run(() => second.commands.fixNow(second.caller(), 'work-2', {})),
    ]);
    expect([slow.ok, quick.ok]).toEqual([true, true]);

    // Overlap is proven, not assumed: both calls entered, the quick one left first, the slow
    // one wrote its outcome only after the other request had fully finished.
    expect(timeline).toEqual([
      'fix-now:12345:start',
      'fix-now:12346:start',
      'fix-now:12346:done',
      'fix-now:12345:done',
    ]);
    // Each in-call collaborator read its own request scope while the other was running.
    expect(seenScopes).toEqual([
      { tag: 'fix-now:12345', scope: { projectId: '12345', actor: 'client-1' } },
      { tag: 'fix-now:12346', scope: { projectId: '12346', actor: 'client-2' } },
    ]);

    // Each chain holds only its own actor and only its own commands: nothing leaked across.
    expect(await projects()).toEqual(['12345', '12346']);
    expect((await entries('12345')).map((entry) => entry.actor)).toEqual(['client-1']);
    expect((await entries('12346')).map((entry) => entry.actor)).toEqual(['client-2']);
    expect(await entries('12346')).toHaveLength(1);
    expect(await entries('12345')).toHaveLength(1);
    expect(first.calls).toEqual(['daemon:12345:work-1']);
    expect(second.calls).toEqual(['daemon:12346:work-2']);
  });

  test('a command outside an authenticated scope is denied before the daemon is called', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await expect(fix.commands.fixNow(fix.caller(), 'work-1', {})).rejects.toMatchObject({
      status: 403,
      message: 'The request has no authenticated audit scope',
    });
    // No daemon call means no policy gate, no model call and no GitHub call downstream.
    expect(fix.calls).toEqual([]);
    expect(await projects()).toEqual([]);
  });

  test('a forged caller is denied before the daemon is called', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await expect(
      fix.run(() => fix.commands.fixNow({ ...fix.caller(), projectId: '99999' }, 'work-1', {})),
    ).rejects.toMatchObject({ status: 403 });
    expect(fix.calls).toEqual([]);
    expect(await projects()).toEqual([]);
  });

  test('a blank authenticated project is denied before the daemon is called', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await expect(
      fix.run(() => fix.commands.fixNow({ ...fix.caller(), projectId: '  ' }, 'work-1', {})),
    ).rejects.toMatchObject({ status: 403 });
    expect(fix.calls).toEqual([]);
  });

  test('a note with a secret never enters an audit payload', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await fix.run(() =>
      fix.commands.fixNow(fix.caller(), 'work-1', { note: `rotate ${SECRET} now` }),
    );
    expect(JSON.stringify(await entries('12345'))).not.toContain(SECRET);
  });

  test('a command the daemon rejected writes no outcome entry', async () => {
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      audit: fixture.audit,
      reply: async () => {
        throw new WorkError('MANUAL_ASSIGNMENT', 'A person must fix this Work item');
      },
    });
    await expect(
      fix.run(() => fix.commands.fixNow(fix.caller(), 'work-1', {})),
    ).rejects.toMatchObject({ code: 'MANUAL_ASSIGNMENT' });
    expect(await projects()).toEqual([]);
  });

  test('withholds the result when the outcome append hits a real SQL error', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await fixture.db.$executeRawUnsafe(`
      CREATE FUNCTION reject_fix_outcome() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'fix.outcome' THEN RAISE EXCEPTION 'chain unavailable'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await fixture.db.$executeRawUnsafe(
      'CREATE TRIGGER reject_fix_outcome BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_fix_outcome()',
    );
    try {
      await expect(fix.run(() => fix.commands.fixNow(fix.caller(), 'work-1', {}))).rejects.toThrow(
        'The Fix outcome audit is unavailable',
      );
    } finally {
      await fixture.db.$executeRawUnsafe('DROP TRIGGER reject_fix_outcome ON audit_entries');
      await fixture.db.$executeRawUnsafe('DROP FUNCTION reject_fix_outcome()');
    }
    expect(fix.calls).toEqual(['daemon:12345:work-1']);
    expect(await entries('12345')).toEqual([]);
  });

  test('an answer that resumes an attempt audits its own outcome', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await fix.run(() =>
      fix.commands.answer(fix.caller('command-2'), 'work-1', {
        attemptId: 'attempt-1',
        questionId: 'question-1',
        params: { INCIDENT: 'OOM' },
      }),
    );
    const rows = await fixture.db.auditEntry.findMany({ select: { eventKey: true } });
    expect(rows.map((row) => row.eventKey)).toEqual(['fix:attempt-1:fix_now:outcome']);
  });

  test('a triage that starts no attempt writes no outcome entry', async () => {
    const fix = boundary({ projectId: '12345', clientId: 'client-1', audit: fixture.audit });
    await fix.run(() => fix.commands.triage(fix.caller(), 'work-1', { assignee: 'needs_human' }));
    expect(await projects()).toEqual([]);
  });

  test('a triage that starts the automatic trigger audits that attempt', async () => {
    const fix = boundary({
      projectId: '12345',
      clientId: 'client-1',
      audit: fixture.audit,
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
    expect((await entries('12345')).map((entry) => entry.type)).toEqual(['fix.outcome']);
  });
});
