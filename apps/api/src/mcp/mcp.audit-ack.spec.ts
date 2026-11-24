import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { AuditDraft } from '@graveshift/core';
import { parsePolicy } from '@graveshift/policy';
import { describe, expect, mock, test } from 'bun:test';

import { HttpMcpBackend } from './mcp.backend';
import { McpProjectContext } from './mcp-project-context';
import { McpTools } from './mcp.tools';
import {
  MCP_AUDIT_WRITER,
  MCP_BACKEND,
  MCP_ENV_MODE,
  MCP_POLICY,
  type McpAuditWriter,
  type McpBackend,
} from './mcp.types';
import { FakeMcpBackend } from '../../test/fakes/fake-mcp-backend';

const draft: AuditDraft = {
  key: 'mcp:proposal:1',
  actor: 'policy',
  type: 'policy.decision',
  payload: { effect: 'allow' },
};

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

describe('MCP audit acknowledgement', () => {
  test('with no Project bound the backend refuses and writes nothing', async () => {
    const append = mock(async () => ({}) as never);
    const sink = { append } as unknown as ConstructorParameters<typeof HttpMcpBackend>[1];
    const backend = new HttpMcpBackend({} as never, sink, new McpProjectContext(), {} as never);

    expect(await backend.auditDecision(draft)).toEqual({
      acknowledged: false,
      reason: 'no_project',
    });
    expect(append).not.toHaveBeenCalled();
  });

  test('with a bound Project the backend acknowledges only after a successful append', async () => {
    const append = mock(async () => ({}) as never);
    const sink = { append } as unknown as ConstructorParameters<typeof HttpMcpBackend>[1];
    const context = new McpProjectContext();
    context.enter('12345');
    const backend = new HttpMcpBackend({} as never, sink, context, {} as never);

    expect(await backend.auditDecision(draft)).toEqual({ acknowledged: true, key: draft.key });
    expect(append).toHaveBeenCalledWith('12345', draft);
  });

  test('propose_fix withholds its result when the audit is not acknowledged', async () => {
    const writer: McpAuditWriter = {
      requireProject: () => {},
      auditDecision: async () => ({ acknowledged: false, reason: 'no_project' }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        McpTools,
        { provide: MCP_BACKEND, useValue: new FakeMcpBackend() },
        { provide: MCP_AUDIT_WRITER, useValue: writer },
        { provide: MCP_POLICY, useValue: policy },
        { provide: MCP_ENV_MODE, useValue: undefined },
      ],
    }).compile();
    try {
      const tools = moduleRef.get(McpTools);
      await expect(tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })).rejects.toThrow(
        'Policy audit was not acknowledged',
      );
    } finally {
      await moduleRef.close();
    }
  });

  test('an unbound Project refuses propose_fix at the guard before any read or write', async () => {
    const append = mock(async () => ({}) as never);
    const sink = { append } as unknown as ConstructorParameters<typeof HttpMcpBackend>[1];
    const writer = new HttpMcpBackend({} as never, sink, new McpProjectContext(), {} as never);
    const getIncident = mock(async () => {
      throw new Error('backend read must not happen');
    });
    const getCounters = mock(async () => {
      throw new Error('backend read must not happen');
    });
    const policyContext = mock(async () => {
      throw new Error('backend read must not happen');
    });
    const backend = { getIncident, getCounters, policyContext } as unknown as McpBackend;
    const moduleRef = await Test.createTestingModule({
      providers: [
        McpTools,
        { provide: MCP_BACKEND, useValue: backend },
        { provide: MCP_AUDIT_WRITER, useValue: writer },
        { provide: MCP_POLICY, useValue: policy },
        { provide: MCP_ENV_MODE, useValue: undefined },
      ],
    }).compile();
    try {
      const tools = moduleRef.get(McpTools);
      await expect(tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })).rejects.toThrow(
        'An authenticated Project is required',
      );
      expect(getIncident).not.toHaveBeenCalled();
      expect(getCounters).not.toHaveBeenCalled();
      expect(policyContext).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });
});
