import { WorkError, type FixResult } from '@graveshift/work';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { HttpClientModule } from '@nestjs/http-client';
import { Test } from '@nestjs/testing';
import { describe, expect, test } from 'bun:test';

import { workItem } from '../../test/fakes/fake-fix-deps';
import { DaemonWorkClient } from './daemon-work.client';

const caller = { projectId: 'project-1', actor: 'fixture', commandId: 'command-1' };

function denied(): FixResult {
  return {
    item: workItem(),
    trigger: 'fix_now',
    effect: 'deny',
    ok: false,
    pr: null,
    reason: 'low_confidence',
    failure: 'policy_denied',
    routing: null,
    attemptId: 'attempt-1',
  };
}

async function clientFixture(reply: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const stubFetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request =
        input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      requests.push(request);
      return reply(request);
    },
    { preconnect: fetch.preconnect },
  );
  const moduleRef = await Test.createTestingModule({
    imports: [
      HttpClientModule.register({
        name: 'daemon',
        baseUrl: 'http://127.0.0.1:2602',
        retry: false,
        headers: { authorization: 'Bearer dedicated-internal-test-token' },
        fetch: stubFetch,
      }),
    ],
    providers: [DaemonWorkClient],
  }).compile();
  return { client: moduleRef.get(DaemonWorkClient), requests, close: () => moduleRef.close() };
}

describe('DaemonWorkClient wire boundary', () => {
  test('sends the authenticated owned command and validates its completed result', async () => {
    let body: unknown;
    const fixture = await clientFixture(async (request) => {
      body = await request.json();
      return Response.json(denied());
    });
    try {
      expect(await fixture.client.fixNow(caller, 'work-1', { note: 'Check memory use' })).toEqual(
        denied(),
      );
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.requests[0]?.url).toBe('http://127.0.0.1:2602/internal/work/fix-now');
      expect(fixture.requests[0]?.headers.get('authorization')).toBe(
        'Bearer dedicated-internal-test-token',
      );
      expect(body).toEqual({ caller, id: 'work-1', input: { note: 'Check memory use' } });
    } finally {
      await fixture.close();
    }
  });

  test('triage and answer each use their canonical command routes', async () => {
    const fixture = await clientFixture((request) =>
      Response.json(
        request.url.endsWith('/triage') ? { item: workItem(), autoFix: null } : denied(),
      ),
    );
    try {
      await fixture.client.triage(caller, 'work-1', { assignee: 'needs_human' });
      await fixture.client.answer(caller, 'work-1', {
        attemptId: 'attempt-1',
        questionId: 'question-1',
        params: { INCIDENT: 'OOM' },
      });
      expect(fixture.requests.map((request) => new URL(request.url).pathname)).toEqual([
        '/internal/work/triage',
        '/internal/work/answer',
      ]);
    } finally {
      await fixture.close();
    }
  });

  test('maps a canonical domain error and rejects a mismatched upstream error', async () => {
    const fixture = await clientFixture(() =>
      Response.json(
        new WorkError('MANUAL_ASSIGNMENT', 'A person must fix this Work item').toJSON(),
        { status: 403 },
      ),
    );
    try {
      await expect(fixture.client.fixNow(caller, 'work-1', {})).rejects.toMatchObject({
        code: 'MANUAL_ASSIGNMENT',
        status: 403,
      });
      expect(fixture.requests).toHaveLength(1);
    } finally {
      await fixture.close();
    }
    const invalid = await clientFixture(() =>
      Response.json(
        { code: 'MANUAL_ASSIGNMENT', status: 403, message: 'upstream' },
        { status: 409 },
      ),
    );
    try {
      await expect(invalid.client.fixNow(caller, 'work-1', {})).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    } finally {
      await invalid.close();
    }
  });

  test('withholds malformed and inconsistent daemon outcomes', async () => {
    const fixture = await clientFixture(() => Response.json({ ...denied(), ok: true }));
    try {
      await expect(fixture.client.fixNow(caller, 'work-1', {})).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    } finally {
      await fixture.close();
    }
  });

  test('does not retry a lost command or expose transport details', async () => {
    const fixture = await clientFixture(() => {
      throw new Error('connection failed with private detail');
    });
    try {
      await expect(fixture.client.fixNow(caller, 'work-1', {})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(fixture.requests).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });
});
