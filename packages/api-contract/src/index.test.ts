import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import contractPackage from '../package.json';
import {
  API_CONTRACT_VERSION,
  type AgentsConfigResponse,
  type Assignee,
  type HealthResponse,
  type PolicyConfigResponse,
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
    const agents = openapi.paths['/api/config/agents'];
    const policy = openapi.paths['/api/config/policy'];
    expect(Object.keys(agents)).toEqual(['get']);
    expect(Object.keys(policy)).toEqual(['get']);
    // The response carries the env variable name, never a key or a resolved value.
    expect(agents.get.responses['200'].content['application/json'].schema).not.toHaveProperty(
      'apiKey',
    );
  });

  test('exports the read-only config response types', () => {
    // Compile-time check: these types come from the generated paths only.
    type AgentsShape = Pick<AgentsConfigResponse, 'system' | 'client'>;
    type PolicyShape = Pick<PolicyConfigResponse, 'version' | 'mode' | 'default'>;
    const shape: AgentsShape = { system: [], client: [] };
    const policyShape: PolicyShape = { version: 1, mode: 'dry-run', default: 'deny' };
    expect(shape.system).toEqual([]);
    expect(policyShape.mode).toBe('dry-run');
  });
});
