import type { FixAttempt, FixResult } from '@graveshift/work';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { TEST_ROOT_ENV } from '../../test/fakes/auth-test-config';
import { workItem } from '../../test/fakes/fake-fix-deps';
import { InternalGuard } from '../internal/internal.guard';
import { InternalWorkController } from './controllers/internal-work.controller';
import { WorkItemRepo } from './work-item.repo';

const caller = { projectId: 'project-1', actor: 'daemon', commandId: 'command-1' };
const attempt: FixAttempt = {
  id: 'attempt-1',
  projectId: caller.projectId,
  workItemId: 'work-1',
  commandId: caller.commandId,
  workerId: null,
  leaseUntil: null,
  agent: 'SRE Agent',
  trigger: 'fix_now',
  state: 'claimed',
  routingProgress: null,
  params: {},
  questionId: null,
  result: null,
  publication: null,
  baseSha: null,
  version: 0,
  createdAt: '2026-11-21T00:00:00.000Z',
  updatedAt: '2026-11-21T00:00:00.000Z',
};
const snapshot = { item: workItem(), version: 1, activeAttempt: attempt };
const outcome = {
  effect: 'deny' as const,
  ok: false,
  pr: null,
  reason: 'low_confidence',
  failure: 'policy_denied' as const,
  routing: null,
};
const result: FixResult = {
  ...outcome,
  item: snapshot.item,
  trigger: 'fix_now',
  attemptId: attempt.id,
};
const fence = { expectedVersion: 1, attemptId: attempt.id, attemptVersion: 0 };
const progress = {
  version: 1,
  phase: 'awaiting_answer',
  attemptId: attempt.id,
  selectedAgent: { name: attempt.agent, slug: 'sre' },
  text: 'Verified incident',
  params: {},
  missing: ['INCIDENT'],
  question: 'What incident?',
};
const intent = { repo: 'owner/repo', branch: 'graveshift/work-1', baseSha: 'base-sha' };
const pr = {
  repo: intent.repo,
  branch: intent.branch,
  headSha: 'head-sha',
  number: 7,
  url: 'https://github.test/owner/repo/pull/7',
};

describe('private Work item state DTO boundary', () => {
  let app: INestApplication;
  const calls: { method: string; args: unknown[] }[] = [];
  function record<Value>(method: string, args: unknown[], value: Value): Promise<Value> {
    calls.push({ method, args });
    return Promise.resolve(value);
  }

  beforeAll(async () => {
    const runtime = {
      read: (...args: unknown[]) => record('read', args, snapshot),
      replay: (...args: unknown[]) => record('replay', args, null),
      saveTriage: (...args: unknown[]) => record('saveTriage', args, { kind: 'saved', snapshot }),
      claim: (...args: unknown[]) => record('claim', args, { kind: 'claimed', snapshot, attempt }),
      saveQuestion: (...args: unknown[]) => record('saveQuestion', args, result),
      applyAnswer: (...args: unknown[]) =>
        record('applyAnswer', args, { kind: 'claimed', snapshot, attempt }),
      beginPublication: (...args: unknown[]) => record('beginPublication', args, snapshot),
      recordPublication: (...args: unknown[]) => record('recordPublication', args, snapshot),
      finish: (...args: unknown[]) => record('finish', args, result),
      heartbeat: (...args: unknown[]) => record('heartbeat', args, { renewed: true }),
      abandon: (...args: unknown[]) => record('abandon', args, result),
      abortPublication: (...args: unknown[]) => record('abortPublication', args, result),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalWorkController],
      providers: [
        InternalGuard,
        { provide: ConfigService, useValue: new ConfigService(TEST_ROOT_ENV) },
        { provide: WorkItemRepo, useValue: runtime },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: 422,
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());

  const operations = [
    {
      action: 'heartbeat',
      method: 'heartbeat',
      input: { attemptId: attempt.id, workerId: 'worker-1' },
    },
    { action: 'abandon', method: 'abandon', input: fence },
    { action: 'abort-publication', method: 'abortPublication', input: { ...fence, outcome } },
    {
      action: 'save-triage',
      method: 'saveTriage',
      input: { expectedVersion: 1, body: { assignee: 'needs_human' } },
    },
    {
      action: 'claim',
      method: 'claim',
      input: { expectedVersion: 1, command: { kind: 'fix_now', body: {} } },
    },
    { action: 'save-question', method: 'saveQuestion', input: { ...fence, progress } },
    {
      action: 'apply-answer',
      method: 'applyAnswer',
      input: {
        expectedVersion: 1,
        attemptVersion: 0,
        body: { attemptId: attempt.id, questionId: 'question-1', params: { INCIDENT: 'OOM' } },
      },
    },
    { action: 'begin-publication', method: 'beginPublication', input: { ...fence, intent } },
    {
      action: 'record-publication',
      method: 'recordPublication',
      input: { ...fence, pr, baseSha: intent.baseSha },
    },
    { action: 'finish', method: 'finish', input: { ...fence, state: 'failed', outcome } },
  ];

  test.each(operations)(
    '$action maps its validated input into the state port exactly once',
    async ({ action, method, input }) => {
      const before = calls.length;
      await request(app.getHttpServer())
        .post(`/internal/work-items/work-1/${action}`)
        .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
        .send({ caller, input })
        .expect(200);
      expect(calls.slice(before)).toEqual([{ method, args: [{ caller, id: 'work-1', input }] }]);
    },
  );

  test('rejects forged callers, invalid fences, copied progress fields, and conflicting result fields', async () => {
    const before = calls.length;
    const invalid = [
      { action: 'heartbeat', body: { caller, input: { attemptId: attempt.id, workerId: 42 } } },
      { action: 'abandon', body: { caller, input: { ...fence, attemptVersion: -1 } } },
      {
        action: 'abort-publication',
        body: { caller, input: { ...fence, outcome: { ...outcome, extra: true } } },
      },
      {
        action: 'claim',
        body: {
          caller: { ...caller, admin: true },
          input: { expectedVersion: 1, command: { kind: 'fix_now', body: {} } },
        },
      },
      {
        action: 'save-question',
        body: { caller, input: { ...fence, attemptVersion: -1, progress } },
      },
      {
        action: 'save-question',
        body: { caller, input: { ...fence, progress: { ...progress, next: 'invented' } } },
      },
      {
        action: 'finish',
        body: {
          caller,
          input: { ...fence, state: 'completed', outcome: { ...outcome, ok: true } },
        },
      },
    ];
    await Promise.all(
      invalid.map(({ action, body }) =>
        request(app.getHttpServer())
          .post(`/internal/work-items/work-1/${action}`)
          .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
          .send(body)
          .expect(422),
      ),
    );
    expect(calls).toHaveLength(before);
  });
});
