import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import contractPackage from '../package.json';
import {
  API_CONTRACT_VERSION,
  type Assignee,
  type ConfigExportResponse,
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

  test('the config API has one read-only endpoint', () => {
    expect(Object.keys(openapi.paths['/api/config/export'])).toEqual(['get']);
    // The removed read and per-block export paths must not return in the document.
    const removedPaths = [
      '/api/config/agents',
      '/api/config/policy',
      '/api/config/agents/export',
      '/api/config/policy/export',
    ] as const;
    for (const path of removedPaths) expect(openapi.paths).not.toHaveProperty(path);
    // The one path is guarded by a bearer credential from the shared issuer.
    expect(openapi.paths['/api/config/export'].get.security).toEqual([{ bearer: [] }]);
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

describe('config response document', () => {
  test('the whole-config export schema carries every full block', () => {
    const schema =
      openapi.paths['/api/config/export'].get.responses['200'].content['application/json'].schema;
    expect(Object.keys(schema.properties)).toEqual(['boot', 'agents', 'policy', 'fix']);
    expect(Object.keys(schema.properties.boot.properties)).toEqual(['host', 'port']);
    // The export is full: no sanitized whitelist is used at this endpoint.
    const agent = schema.properties.agents.properties.system.items.properties;
    for (const key of ['prompt', 'baseUrl', 'apiKeyEnv', 'allowedTools']) {
      expect(agent).toHaveProperty(key);
    }
    // Full export params are key-value entries, not a sanitized list of names.
    expect(agent.params.items).toHaveProperty('additionalProperties');
    expect(Object.keys(schema.properties.policy.properties)).toEqual(
      expect.arrayContaining(['approvers', 'github', 'rules', 'default']),
    );
    const rule = schema.properties.policy.properties.rules.items.properties;
    expect(Object.keys(rule)).toEqual(expect.arrayContaining(['when', 'params', 'effect']));
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
  });

  test('the single response type keeps the full config at compile time', () => {
    expect(compiledAssertions.every((assertion) => assertion === true)).toBe(true);
    const exported: ConfigExportResponse = {
      boot: { host: '127.0.0.1', port: 3100 },
      agents: {
        system: [
          {
            name: 'Test Agent',
            slug: 'test-agent',
            role: 'tester',
            description: 'd',
            prompt: 'Handle {{CASE}}',
            params: [{ CASE: 'fake case' }],
            provider: '@ai-sdk/openai',
            model: 'fake-test-model',
            baseUrl: 'https://fake.test.invalid/v1',
            apiKeyEnv: 'GRAVESHIFT_TEST_AGENT_API_KEY',
            allowedTools: ['query_metric'],
            dailyBudgetUsd: 1,
          },
        ],
        client: [],
      },
      policy: {
        version: 1,
        mode: 'dry-run',
        approvers: { discordUserIds: [], discordRoleIds: [] },
        limits: {
          maxOpenPrsPerHour: 1,
          maxActionsPerServicePer10Min: 1,
          maxDiagnosisLoops: 1,
          llmDailyBudgetUsd: 0.5,
        },
        llm: { minConfidenceForPr: 0.9, minConfidenceForAction: 0.95 },
        github: {
          repos: [],
        },
        rules: [],
        default: 'deny',
      },
      fix: {
        enabled: false,
        agent: 'Test Agent',
        promptTemplate: 'template',
        gateway: {
          globalDailyBudgetUsd: 1,
          maxRetries: 0,
          timeoutMs: 1000,
          priceTableUsdPer1M: {},
        },
        github: {
          appIdEnv: 'GRAVESHIFT_TEST_GITHUB_APP_ID',
          privateKeyEnv: 'GRAVESHIFT_TEST_GITHUB_PRIVATE_KEY',
          installations: {},
        },
      },
    };
    expect(Object.keys(exported)).toEqual(['boot', 'agents', 'policy', 'fix']);
    expect(exported.agents.system[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_AGENT_API_KEY');
  });
});
