import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import contractPackage from '../package.json';
import {
  API_CONTRACT_VERSION,
  type HealthResponse,
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
      autoFixAllowed: false,
    };
    const list: WorkItemListResponse = { items: [detail], total: 1, offset: 0, limit: 20 };
    expect(list.items[0]?.id).toBe('wi-1');
  });
});
