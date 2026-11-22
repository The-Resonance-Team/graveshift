import { describe, expect, test } from 'bun:test';

import { createCommandHandler } from './command-handler';
import { drainCommands } from './command-lifetime';
import { caller } from './flow-fixtures';
import { harness } from './flow-harness';

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

function handler() {
  const flow = harness();
  const handle = createCommandHandler({
    commands: flow.commands(),
    projectId: caller.projectId,
    token,
    maxBytes: 1024,
    timeoutMs: 1000,
  });
  return { handle, flow };
}

describe('private Work command Request boundary', () => {
  test('requires the dedicated bearer token and verified project before state access', async () => {
    const { handle, flow } = handler();
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
    expect(flow.runtime.calls).toEqual([]);
  });

  test('validates canonical commands, methods, content type, and unknown routes', async () => {
    const { handle } = handler();
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
    const { handle, flow } = handler();
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
    expect(flow.runtime.calls).toEqual([]);
  });

  test('returns the complete fix result and canonical Work errors', async () => {
    const { handle } = handler();
    const completed = await handle(request());
    expect(completed.status).toBe(200);
    expect(completed.headers.get('cache-control')).toBe('no-store');
    expect(await completed.json()).toMatchObject({
      ok: true,
      attemptId: 'attempt-1',
      pr: { number: 7 },
    });
    const missing = handler();
    missing.flow.options.runtime.read = async () => {
      const { WorkError } = await import('@graveshift/work');
      throw new WorkError('WORK_NOT_FOUND', 'The Work item does not exist');
    };
    const response = await missing.handle(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'WORK_NOT_FOUND', status: 404 });
  });

  test('a command timeout stays bounded while shutdown drains the running command', async () => {
    const flow = harness();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = flow.options.execute;
    flow.options.execute = async (input) => {
      entered.resolve();
      await release.promise;
      return original(input);
    };
    const lifetime = drainCommands(flow.commands());
    const handle = createCommandHandler({
      commands: lifetime.commands,
      projectId: caller.projectId,
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
    expect(flow.runtime.snapshot.item.draftPr?.number).toBe(7);
  });
});
