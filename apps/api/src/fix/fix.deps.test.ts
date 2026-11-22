import { loadGraveshiftConfig } from '@graveshift/config';
import { PatchSchema } from '@graveshift/patch';
import { describe, expect, test } from 'bun:test';

import { createFixDeps, FixConfigError } from './fix.deps';

const config = await loadGraveshiftConfig();
const env = {
  ANTHROPIC_API_KEY: 'test-only-key',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-only-key',
  GRAVESHIFT_GITHUB_APP_ID: '12345',
  GRAVESHIFT_GITHUB_PRIVATE_KEY: 'test-only-pem',
};

describe('createFixDeps', () => {
  test('fails closed on first fix when the Agent key env is unset', async () => {
    const deps = createFixDeps(config, { env: {} });
    try {
      await deps.gateway.run({
        agent: 'Exorcist',
        task: 'generate_patch',
        system: 'system',
        prompt: 'prompt',
        schema: PatchSchema,
        validate: () => undefined,
      });
      throw new Error('expected the gateway to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(FixConfigError);
      expect((error as FixConfigError).code).toBe('FIX_CONFIG_ERROR');
      expect((error as FixConfigError).message).toContain('ANTHROPIC_API_KEY');
    }
  });

  test('builds the real gateway and GitHub client from the committed config', () => {
    const deps = createFixDeps(config, { env });
    expect(deps.agent).toBe('Exorcist');
    expect(deps.autoFixEnabled).toBe(true);
    expect(deps.promptTemplate).toContain('{{DIAGNOSIS}}');
    expect(deps.agentMeta.role).toBe('exorcist');
    expect(deps.policy).toBe(config.policy);
    expect(typeof deps.gateway.run).toBe('function');
    expect(typeof deps.client.createPullRequest).toBe('function');
  });

  test('leaves the diagnosis context closed until the daemon read is wired', async () => {
    const deps = createFixDeps(config, { env });
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
      fixPriority: 100,
      draftPr: null,
    });
    expect(loaded.ok).toBe(false);
  });
});
