import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { WorkError } from '@graveshift/work';
import { createCommandHandler } from './command-handler';
import { drainCommands } from './command-lifetime';
import { setupFlow } from './flow.fixture';
import { caller } from './flow-fixtures';

const token = 'local-daemon-internal-token-32-characters';
const apiToken = 'local-api-internal-token-32-characters';

function request(
  path = 'fix-now',
  body: unknown = { caller, id: 'work-1', input: {} },
  authorization = `Bearer ${token}`,
) {
  return new Request(`http://127.0.0.1:2602/internal/work/${path}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbTestEnabled)('private Work command Request boundary', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  const granted = [caller.projectId, 'project-2'];
  beforeEach(async () => {
    flow = await setupFlow({ projects: granted });
  });
  afterEach(async () => {
    await flow?.close();
  });
  const handler = () =>
    createCommandHandler({
      commands: flow.commands({ projectIds: granted }),
      projectIds: granted,
      token,
      maxBytes: 1024,
      timeoutMs: 1000,
    });

  test('requires the dedicated bearer token and verified project before state access', async () => {
    const handle = handler();
    const unauthenticated = await handle(
      request('fix-now', undefined, 'Bearer public-oauth-token'),
    );
    expect(unauthenticated.status).toBe(401);
    const wrongHop = await handle(request('fix-now', undefined, `Bearer ${apiToken}`));
    expect(wrongHop.status).toBe(401);
    const foreign = await handle(
      request('fix-now', { caller: { ...caller, projectId: 'foreign' }, id: 'work-1', input: {} }),
    );
    expect(foreign.status).toBe(403);
    expect(flow.calls).toEqual([]);
  });

  test('a second granted Project runs its command under its own Project', async () => {
    await flow.seedIn('project-2', 'work-2');
    const handle = handler();
    const second = { ...caller, projectId: 'project-2', commandId: 'command-second-project' };
    const response = await handle(request('fix-now', { caller: second, id: 'work-2', input: {} }));
    expect(response.status).toBe(200);
    expect(await flow.db.auditEntry.count({ where: { projectId: 'project-2' } })).toBeGreaterThan(
      0,
    );
    expect(await flow.db.fixAttempt.findFirstOrThrow()).toMatchObject({ projectId: 'project-2' });
  });

  test('validates canonical commands, methods, content type, and unknown routes', async () => {
    const handle = handler();
    expect((await handle(request('missing'))).status).toBe(404);
    expect(
      (await handle(request('fix-now', { caller, id: 'work-1', input: {}, injected: true })))
        .status,
    ).toBe(400);
    expect(
      (
        await handle(
          new Request('http://localhost/internal/work/fix-now', {
            headers: { authorization: `Bearer ${token}` },
          }),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await handle(
          new Request('http://localhost/internal/work/fix-now', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(415);
  });

  test('bounds both declared and streamed request bodies and rejects malformed JSON', async () => {
    const handle = handler();
    const large = request('fix-now', { caller, id: 'work-1', input: { note: 'x'.repeat(2000) } });
    expect((await handle(large)).status).toBe(413);
    const declared = request();
    declared.headers.set('content-length', '99999');
    expect((await handle(declared)).status).toBe(413);
    const malformed = new Request('http://localhost/internal/work/fix-now', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{',
    });
    expect((await handle(malformed)).status).toBe(400);
    expect(flow.calls).toEqual([]);
  });

  test('returns the complete fix result and canonical Work errors', async () => {
    const completed = await handler()(request());
    expect(completed.status).toBe(200);
    expect(completed.headers.get('cache-control')).toBe('no-store');
    expect(await completed.json()).toMatchObject({ ok: true, pr: { number: 8 } });
    flow.options.runtime.read = async () => {
      throw new WorkError('WORK_NOT_FOUND', 'The Work item does not exist');
    };
    const missing = request('fix-now', {
      caller: { ...caller, commandId: 'missing-work' },
      id: 'work-1',
      input: {},
    });
    const response = await handler()(missing);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'WORK_NOT_FOUND', status: 404 });
  });

  test('a command timeout stays bounded while shutdown drains the running command', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = flow.options.execute;
    flow.options.execute = async (input) => {
      entered.resolve();
      await release.promise;
      return original(input);
    };
    const lifetime = drainCommands(flow.commands({ projectIds: granted }));
    const handle = createCommandHandler({
      commands: lifetime.commands,
      projectIds: granted,
      token,
      maxBytes: 1024,
      timeoutMs: 5,
    });
    const response = handle(request());
    await entered.promise;
    expect((await response).status).toBe(504);
    let drained = false;
    const closing = lifetime.stop().then(() => {
      drained = true;
    });
    expect(drained).toBe(false);
    expect((await handle(request())).status).toBe(503);
    release.resolve();
    await closing;
    expect(drained).toBe(true);
    expect((await flow.db.workItem.findFirstOrThrow()).draftPr).toMatchObject({ number: 8 });
  });
});
