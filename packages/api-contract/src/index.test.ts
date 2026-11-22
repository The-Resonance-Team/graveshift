import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import contractPackage from '../package.json';
import {
  API_CONTRACT_VERSION,
  type Assignee,
  type ConfigAgentsExportResponse,
  type ConfigAgentsViewResponse,
  type ConfigPolicyExportResponse,
  type HealthResponse,
  type TriageRequest,
  type WorkItemListResponse,
  type WorkItemResponse,
} from './index';
import { compiledAssertions } from './config-contract-assertions';
import openapi from './openapi.json';

describe('api contract', () => {
  test('generated types file exists', () => {
    expect(existsSync(new URL('./generated/api.ts', import.meta.url))).toBe(true);
  });

  test('exports the health response type', () => {
    const response: HealthResponse = { status: 'ok' };
    expect(response.status).toBe('ok');
    const version: string = API_CONTRACT_VERSION;
    expect(version).toBe(contractPackage.version);
    expect(openapi.info.version).toBe(version);
  });

  test('exports the work item response types', () => {
    const detail: WorkItemResponse = {
      id: 'wi-1',
      title: 'Fix OOM on api',
      description: '',
      successCriteria: [],
      subtasks: { items: [], completed: 0 },
      status: 'todo',
      priority: 'high',
      assignee: 'needs_human',
      reporter: 'wraith',
      startDate: null,
      dueDate: null,
      sprint: null,
      parent: null,
      labels: [],
      team: 'sre',
      watchers: [],
      severity: 'critical',
      service: 'api',
      diagnosisRef: 'diag-1',
      fixPriority: 100,
      draftPr: null,
    };
    const list: WorkItemListResponse = { items: [detail], total: 1, offset: 0, limit: 20 };
    expect(list.items[0]?.id).toBe('wi-1');
  });

  test('exports a triage request type with a distinct assignee', () => {
    const human: TriageRequest = { assignee: 'needs_human' };
    const agent: TriageRequest = { assignee: 'needs_agent_SRE Bot' };
    const assignee: Assignee = agent.assignee;
    expect(human.assignee).toBe('needs_human');
    expect(assignee).toBe('needs_agent_SRE Bot');
  });

  test('the config routes are read-only in the contract', () => {
    const configRoutes = [
      '/api/config/agents',
      '/api/config/policy',
      '/api/config/agents/export',
      '/api/config/policy/export',
      '/api/config/export',
    ] as const;
    for (const path of configRoutes) {
      expect(Object.keys(openapi.paths[path] ?? {})).toEqual(['get']);
    }
  });

  test('the create-credential request advertises credential scopes only', () => {
    // The document must not offer config:read or config:export: the service denies them
    // for every credential kind, so advertising them would promise the impossible.
    const enumValues = openapi.components.schemas.CreateCredentialDto.properties.scopes.items.enum;
    expect(enumValues).toEqual([
      'incidents:read',
      'diagnoses:read',
      'audit:read',
      'logs:read',
      'metrics:read',
      'fix:propose',
      'events:publish',
    ]);
    expect(enumValues.filter((scope) => scope.startsWith('config:'))).toEqual([]);
  });
});

// The compile-time half of the sanitized/full contract lives in
// src/config-contract-assertions.ts, where `bun run typecheck` enforces it.

describe('config response document', () => {
  test('the sanitized schemas publish the whitelist and nothing else', () => {
    const agentSchema =
      openapi.paths['/api/config/agents'].get.responses['200'].content['application/json'].schema
        .properties.system.items.properties;
    expect(Object.keys(agentSchema)).toEqual([
      'name',
      'slug',
      'role',
      'description',
      'provider',
      'model',
      'dailyBudgetUsd',
      'escalateTo',
      'params',
    ]);
    // Param names only: the sanitized item is a plain string, not a key-value map.
    expect(agentSchema.params.items.type).toBe('string');
    for (const key of ['prompt', 'baseUrl', 'apiKeyEnv', 'allowedTools']) {
      expect(agentSchema).not.toHaveProperty(key);
    }
    expect(
      openapi.paths['/api/config/agents/export'].get.responses['200'].content['application/json']
        .schema.properties.system.items.properties,
    ).toHaveProperty('apiKeyEnv');

    const policySchema =
      openapi.paths['/api/config/policy'].get.responses['200'].content['application/json'].schema;
    expect(Object.keys(policySchema.properties)).toEqual([
      'version',
      'mode',
      'limits',
      'llm',
      'rules',
      'default',
    ]);
    expect(policySchema.properties).not.toHaveProperty('approvers');
    expect(policySchema.properties).not.toHaveProperty('github');
    expect(Object.keys(policySchema.properties.rules.items.properties)).toEqual([
      'id',
      'action',
      'effect',
    ]);
    // Counter-check: the full policy export keeps what the sanitized view drops.
    const fullPolicy =
      openapi.paths['/api/config/policy/export'].get.responses['200'].content['application/json']
        .schema.properties;
    expect(Object.keys(fullPolicy)).toEqual(
      expect.arrayContaining(['approvers', 'github', 'rules']),
    );
    expect(Object.keys(fullPolicy.rules.items.properties)).toEqual(
      expect.arrayContaining(['id', 'action', 'when', 'params', 'effect']),
    );
  });

  test('the whole-config export schema carries every block', () => {
    const schema =
      openapi.paths['/api/config/export'].get.responses['200'].content['application/json'].schema;
    expect(Object.keys(schema.properties)).toEqual(['boot', 'agents', 'policy', 'fix']);
    expect(Object.keys(schema.properties.boot.properties)).toEqual(['host', 'port']);
    expect(Object.keys(schema.properties.fix.properties)).toEqual([
      'enabled',
      'agent',
      'promptTemplate',
      'gateway',
      'github',
    ]);
    // The three credential fields stay environment variable names in the document.
    expect(Object.keys(schema.properties.fix.properties.github.properties)).toEqual([
      'appIdEnv',
      'privateKeyEnv',
      'installations',
    ]);
    expect(schema.properties.fix.properties.github.properties).not.toHaveProperty('privateKey');
    expect(
      openapi.paths['/api/config/export'].get.responses['200'].content['application/json'].schema
        .properties.agents.properties.system.items.properties,
    ).toHaveProperty('apiKeyEnv');
  });

  test('the sanitized and full response types stay distinct at compile time', () => {
    expect(compiledAssertions.every((assertion) => assertion === true)).toBe(true);
    const sanitizedAgent: ConfigAgentsViewResponse['system'][number] = {
      name: 'Test Agent',
      slug: 'test-agent',
      role: 'tester',
      description: 'd',
      provider: '@ai-sdk/openai',
      model: 'm',
      dailyBudgetUsd: 1,
      params: ['CASE'],
    };
    const exportedAgent: ConfigAgentsExportResponse['system'][number] = {
      ...sanitizedAgent,
      prompt: 'Handle {{CASE}}',
      params: [{ CASE: 'fake case' }],
      baseUrl: 'https://fake.test.invalid/v1',
      apiKeyEnv: 'GRAVESHIFT_TEST_AGENT_API_KEY',
      allowedTools: ['query_metric'],
    };
    // The two shapes are not interchangeable: the sanitized item has no prompt field.
    expect(Object.keys(exportedAgent)).toContain('apiKeyEnv');
    expect(Object.keys(sanitizedAgent)).not.toContain('apiKeyEnv');
    expect(sanitizedAgent.params).toEqual(['CASE']);
    const exportedPolicy: ConfigPolicyExportResponse['rules'][number] = {
      id: 'fake-deny-db',
      action: '*',
      when: { services: ['postgres'] },
      effect: 'deny',
    };
    expect(Object.keys(exportedPolicy)).toContain('when');
  });
});
