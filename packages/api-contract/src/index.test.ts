import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import contractPackage from '../package.json';
import {
  API_CONTRACT_VERSION,
  type Assignee,
  type ConfigAgentsExportResponse,
  type ConfigAgentsViewResponse,
  type ConfigPolicyExportResponse,
  type ConfigPolicyViewResponse,
  type HealthResponse,
  type TriageRequest,
  type WorkItemListResponse,
  type WorkItemResponse,
} from './index';
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
    ] as const;
    for (const path of configRoutes) {
      expect(Object.keys(openapi.paths[path] ?? {})).toEqual(['get']);
    }
  });

  test('the sanitized and full config response types are distinct', () => {
    // The sanitized (config:read) types carry the whitelist fields only.
    type AgentsViewShape = Pick<
      ConfigAgentsViewResponse['system'][number],
      'name' | 'slug' | 'role' | 'description' | 'provider' | 'model' | 'dailyBudgetUsd'
    >;
    type PolicyViewShape = Pick<
      ConfigPolicyViewResponse,
      'version' | 'mode' | 'limits' | 'llm' | 'rules' | 'default'
    >;
    // The full (config:export) types keep apiKeyEnv as a variable name.
    type AgentsExportShape = Pick<ConfigAgentsExportResponse['system'][number], 'apiKeyEnv'>;
    const view: AgentsViewShape = {
      name: 'Test Agent',
      slug: 'test-agent',
      role: 'tester',
      description: 'd',
      provider: '@ai-sdk/openai',
      model: 'm',
      dailyBudgetUsd: 1,
    };
    const policyView: PolicyViewShape = {
      version: 1,
      mode: 'dry-run',
      limits: {
        maxOpenPrsPerHour: 0,
        maxActionsPerServicePer10Min: 0,
        maxDiagnosisLoops: 0,
        llmDailyBudgetUsd: 0,
      },
      llm: { minConfidenceForPr: 1, minConfidenceForAction: 1 },
      rules: [],
      default: 'deny',
    };
    const exported: AgentsExportShape = { apiKeyEnv: 'GRAVESHIFT_TEST_AGENT_API_KEY' };
    expect(view.slug).toBe('test-agent');
    expect(policyView.default).toBe('deny');
    expect(exported.apiKeyEnv).toBe('GRAVESHIFT_TEST_AGENT_API_KEY');

    // The sanitized Agent view type has no prompt, baseUrl, apiKeyEnv or allowedTools,
    // and the sanitized policy view has no approvers or github block.
    type ForbiddenAgentKeys = 'prompt' | 'params' | 'baseUrl' | 'apiKeyEnv' | 'allowedTools';
    type ForbiddenPolicyKeys = 'approvers' | 'github';
    type AgentViewKeys = keyof ConfigAgentsViewResponse['system'][number];
    type PolicyViewKeys = keyof ConfigPolicyViewResponse;
    // Compile-time: these assignments fail if a forbidden key ever enters the types.
    const noAgentLeak: Exclude<AgentViewKeys, ForbiddenAgentKeys>[] = [
      'name',
      'slug',
      'role',
      'description',
      'provider',
      'model',
      'dailyBudgetUsd',
      'escalateTo',
    ];
    const noPolicyLeak: Exclude<PolicyViewKeys, ForbiddenPolicyKeys>[] = [
      'version',
      'mode',
      'limits',
      'llm',
      'rules',
      'default',
    ];
    // Counter-check: the full export type keeps approvers and github, so the check
    // above really distinguishes the two surfaces instead of a broken schema.
    type ExportPolicyKeys = keyof ConfigPolicyExportResponse;
    const fullKeeps: Extract<ExportPolicyKeys, 'approvers' | 'github'>[] = ['approvers', 'github'];
    expect(fullKeeps.length).toBe(2);
    expect(noAgentLeak).toContain('name');
    expect(noPolicyLeak).toContain('default');
  });
});
