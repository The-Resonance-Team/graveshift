import { describe, expect, test } from 'bun:test';
import { PrRefSchema, WorkItemSchema } from '@graveshift/core';
import {
  AnswerCommandSchema,
  FixNowCommandSchema,
  FixResultSchema,
  TriageCommandSchema,
  TriageResultSchema,
  WorkErrorSchema,
  WorkRoutingSchema,
} from '@graveshift/work';

import { workItemListResponseSchema } from '../../../api/src/work-items/work-item.schema';
import { emptyWorkItemList, sampleWorkItemList, sampleWorkItems } from './work-items';
import { sampleWorkRoutings } from './work-routing';
import {
  sampleFixResults,
  sampleTriageResults,
  sampleWorkCommands,
  sampleWorkErrors,
} from './work-results';

function expectExactKeys(value: object, keys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

function expectSchema(
  schema: { safeParse(value: unknown): { success: boolean; data?: unknown } },
  value: unknown,
): void {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data).toEqual(value);
}

function fixture(id: string) {
  const match = sampleWorkItems.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`Missing sample work item: ${id}`);
  return match.payload;
}

describe('Work item fixtures', () => {
  test('records match the core schema and contain only API fields', () => {
    for (const sample of sampleWorkItems) {
      expect(WorkItemSchema.parse(sample.payload)).toEqual(sample.payload);
      expectExactKeys(sample.payload, Object.keys(WorkItemSchema.shape));
      expectExactKeys(sample.payload.subtasks, ['items', 'completed']);
      for (const subtask of sample.payload.subtasks.items) {
        expectExactKeys(subtask, ['id', 'title', 'done']);
      }
      if (sample.payload.draftPr !== null) {
        expectExactKeys(sample.payload.draftPr, Object.keys(PrRefSchema.shape));
      }
      expect(sample.payload.id).toBe(sample.id);
      expect(sample.scope.kind).toBe('project');
    }
    expect(new Set(sampleWorkItems.map((sample) => sample.payload.id)).size).toBe(
      sampleWorkItems.length,
    );
  });

  test('records cover assignment, question, completion, failure, and no-PR cases', () => {
    expect(fixture('work-human').assignee).toBe('needs_human');
    expect(fixture('work-manual-agent').assignee).toBe('needs_agent_SRE Agent');
    expect(fixture('work-auto-agent').assignee).toBe('needs_agent_Exorcist');
    expect(fixture('work-saved-question').draftPr).toBeNull();
    expect(fixture('work-done').status).toBe('done');
    expect(fixture('work-done').draftPr).not.toBeNull();
    expect(fixture('work-failed').draftPr).toBeNull();
    expect(fixture('work-no-draft-pr').draftPr).toBeNull();
  });

  test('list responses match the API schema and preserve fix priority order', () => {
    for (const list of [sampleWorkItemList, emptyWorkItemList]) {
      expect(workItemListResponseSchema.parse(list.payload)).toEqual(list.payload);
      expectExactKeys(list.payload, ['items', 'total', 'offset', 'limit']);
      expect(list.payload.total).toBe(list.payload.items.length);
    }
    const priorities = sampleWorkItemList.payload.items.map((item) => item.fixPriority);
    expect(priorities).toEqual([...priorities].sort((left, right) => left - right));
  });
});

describe('routing fixtures', () => {
  test('routing responses match the strict work schema', () => {
    for (const sample of sampleWorkRoutings) {
      expect(WorkRoutingSchema.parse(sample.payload)).toEqual(sample.payload);
    }
  });

  test('a saved question carries its question and missing input', () => {
    const sample = sampleWorkRoutings.find(
      (candidate) => candidate.id === 'routing-saved-question',
    );
    if (sample === undefined) throw new Error('Missing saved-question routing fixture');
    const routing = sample.payload.routing;
    expect(routing?.state).toBe('awaiting_answer');
    expect(routing?.questionId).toBe('question-environment-1');
    expect(routing?.question).toBe('Which Environment should the change target?');
    expect(routing?.missing).toEqual(['ENVIRONMENT']);
  });
});

describe('work command result fixtures', () => {
  test('triage and fix results match their strict schemas', () => {
    for (const sample of sampleTriageResults) {
      expect(TriageResultSchema.parse(sample.payload)).toEqual(sample.payload);
    }
    for (const sample of sampleFixResults) {
      expect(FixResultSchema.parse(sample.payload)).toEqual(sample.payload);
    }
  });

  test('success has a draft pull request and failures do not', () => {
    const done = sampleFixResults.find((sample) => sample.id === 'fix-done');
    if (done === undefined) throw new Error('Missing completed fix fixture');
    expect(done.payload.ok).toBe(true);
    expect(done.payload.pr).not.toBeNull();
    for (const id of ['fix-failed', 'fix-no-draft-pr', 'fix-saved-question']) {
      const sample = sampleFixResults.find((candidate) => candidate.id === id);
      if (sample === undefined) throw new Error(`Missing fix fixture: ${id}`);
      expect(sample.payload.ok).toBe(false);
      expect(sample.payload.pr).toBeNull();
    }
  });

  test('errors match the authoritative code and status mapping', () => {
    for (const sample of sampleWorkErrors) {
      expect(WorkErrorSchema.parse(sample.payload)).toEqual(sample.payload);
      expectExactKeys(sample.payload, ['code', 'status', 'message']);
    }
  });

  test('command envelopes match their schemas and Project scope', () => {
    for (const sample of sampleWorkCommands) {
      expect(sample.scope.kind).toBe('project');
      if (sample.scope.kind !== 'project') throw new Error('Expected a Project scope');
      expect(sample.payload.caller.projectId).toBe(sample.scope.projectId);
      const payload = sample.payload;
      if ('assignee' in payload.input) {
        expectSchema(TriageCommandSchema, payload);
      } else if ('note' in payload.input) {
        expectSchema(FixNowCommandSchema, payload);
      } else {
        expectSchema(AnswerCommandSchema, payload);
      }
    }
  });
});
