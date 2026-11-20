import { afterEach, describe, expect, test } from 'bun:test';

import { createFixDeps, FixConfigError } from './fix.deps';

const original = process.env.POLICY_PATH;

afterEach(() => {
  if (original === undefined) delete process.env.POLICY_PATH;
  else process.env.POLICY_PATH = original;
});

describe('createFixDeps', () => {
  test('reports a typed error for an unreadable POLICY_PATH', async () => {
    process.env.POLICY_PATH = '/nonexistent-graveshift-policy.yaml';
    try {
      await createFixDeps();
      throw new Error('expected createFixDeps to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(FixConfigError);
      expect((error as FixConfigError).code).toBe('FIX_CONFIG_ERROR');
      expect((error as FixConfigError).message).toContain('/nonexistent-graveshift-policy.yaml');
    }
  });

  test('fails closed when no policy is configured', async () => {
    delete process.env.POLICY_PATH;
    const deps = await createFixDeps();
    const loaded = await deps.context.load({
      id: 'wi-1',
      title: 'Fix OOM on api',
      description: '',
      successCriteria: [],
      subtasks: { items: [], completed: 0 },
      status: 'todo',
      priority: 'medium',
      assignee: 'needs_human',
      reporter: 'wraith',
      startDate: null,
      dueDate: null,
      sprint: null,
      parent: null,
      labels: [],
      team: 'sre',
      watchers: [],
      severity: 'warning',
      service: 'api',
      diagnosisRef: 'diag-1',
      autoFixAllowed: true,
      fixPriority: 100,
      draftPr: null,
    });
    expect(loaded.ok).toBe(false);
  });
});
