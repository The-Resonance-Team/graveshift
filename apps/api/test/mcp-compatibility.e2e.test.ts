import 'reflect-metadata';
import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import { parsePolicy } from '@graveshift/policy';
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';

import { AppModule } from '../src/app.module';
import { MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from '../src/mcp/mcp.types';
import { FakeMcpBackend, SECRET } from './fakes/fake-mcp-backend';

const REQUIRED_TOOLS = [
  'list_services',
  'list_incidents',
  'get_incident',
  'get_diagnosis',
  'get_audit_log',
  'verify_audit_chain',
  'propose_fix',
  'tail_logs',
  'query_metric',
];

const policy = parsePolicy({
  version: 1,
  mode: 'act',
  approvers: { discordUserIds: [], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 3,
    maxActionsPerServicePer10Min: 1,
    maxDiagnosisLoops: 2,
    llmDailyBudgetUsd: 2,
  },
  llm: { minConfidenceForPr: 0.6, minConfidenceForAction: 0.75 },
  github: { repos: [] },
  rules: [{ id: 'pr-code', action: 'open_pr', effect: 'allow' }],
  default: 'deny',
});

const toolText = (result: unknown): string => {
  const content = (result as { content: Array<{ text?: string }> }).content;
  return content[0]?.text ?? '';
};

describe('MCP server (in-memory client)', () => {
  let moduleRef!: TestingModule;
  let client!: Client;
  let legacy!: Client;
  const backend = new FakeMcpBackend();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_BACKEND)
      .useValue(backend)
      .overrideProvider(MCP_POLICY)
      .useValue(policy)
      .overrideProvider(MCP_ENV_MODE)
      .useValue(undefined)
      .compile();
    client = await connectMcpClient(moduleRef);
    legacy = await connectMcpClient(moduleRef, { era: 'legacy' });
  });

  afterAll(async () => {
    await client?.close();
    await legacy?.close();
    await moduleRef?.close();
  });

  test('lists the nine migrated tools, both prompts and the resource template', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(REQUIRED_TOOLS));
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual([
      'triage_incident',
      'write_postmortem',
    ]);
    expect((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate).toBe(
      'graveshift://incidents/{id}/postmortem',
    );
  });

  test('a 2025-06-18 era client lists tools and calls one successfully', async () => {
    expect(legacy.getProtocolEra()).toBe('legacy');
    expect(legacy.getServerVersion()).toMatchObject({ name: 'graveshift-mcp', version: '0.1.0' });
    const { tools } = await legacy.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(REQUIRED_TOOLS));
    const result = await legacy.callTool({ name: 'list_incidents', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(toolText(result))).toHaveLength(3);
  });

  test('redacts secrets in tool, prompt and resource replies', async () => {
    const calls = [
      { name: 'get_diagnosis', arguments: { id: 'inc1' } },
      { name: 'get_incident', arguments: { id: 'inc1' } },
      { name: 'tail_logs', arguments: { service: 'api' } },
    ];
    const results = await Promise.all(calls.map((call) => client.callTool(call)));
    for (const result of results) {
      expect(result.isError).toBeFalsy();
      expect(toolText(result)).not.toContain(SECRET);
    }
    const prompt = await client.getPrompt({
      name: 'triage_incident',
      arguments: { incidentId: SECRET },
    });
    expect(JSON.stringify(prompt)).not.toContain(SECRET);
    const resource = await client.readResource({
      uri: 'graveshift://incidents/inc1/postmortem',
    });
    const text = String((resource.contents[0] as { text?: string }).text ?? '');
    expect(text).toContain('# Autopsy: api');
    expect(text).not.toContain(SECRET);
  });

  test('propose_fix decides only and never executes an action', async () => {
    const execute = spyOn(backend, 'execute');
    try {
      const pr = await client.callTool({
        name: 'propose_fix',
        arguments: { incidentId: 'inc1', action: 'open_pr' },
      });
      expect(pr.isError).toBeFalsy();
      expect(JSON.parse(toolText(pr))).toMatchObject({
        executed: false,
        decision: { effect: 'allow' },
        limits: { enforced: true, counters: expect.any(Object) },
      });

      const restart = await client.callTool({
        name: 'propose_fix',
        arguments: { incidentId: 'inc1', action: 'restart' },
      });
      expect(restart.isError).toBeFalsy();
      expect(JSON.parse(toolText(restart))).toMatchObject({
        executed: false,
        decision: { effect: 'deny' },
      });

      const missing = await client.callTool({
        name: 'propose_fix',
        arguments: { incidentId: 'nope', action: 'restart' },
      });
      expect(missing.isError).toBe(true);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });

  test('answers a malformed resource URI with not found, not a server error', async () => {
    const resource = await client
      .readResource({ uri: 'graveshift://incidents/%E0%A4%A/postmortem' })
      .catch((error: unknown) => error);
    expect(resource).toBeInstanceOf(Error);
    expect(String((resource as Error).message)).toContain('not found');
  });
});
