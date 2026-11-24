import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  createGraveshiftMcp,
  GraveshiftMcpAuthError,
  type FetchLike,
} from '@graveshift/mcp-client';
import { parsePolicy } from '@graveshift/policy';
import { McpHttpService } from '@nestjs/mcp';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { AppModule } from '../src/app.module';
import { MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from '../src/mcp/mcp.types';
import { FakeMcpBackend, SECRET } from './fakes/fake-mcp-backend';

/**
 * Evidence for ticket #46: one import of `@graveshift/mcp-client` calls one
 * tool of the existing MCP endpoint in `apps/api/src/mcp` and gets a typed
 * result. No second MCP server exists. The call runs through the same
 * `McpHttpService` handler the `/mcp` route uses, with no socket, and the
 * backend, policy and env mode are the test seams the module already exports.
 */

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

const TOKEN = 'sdk-e2e-token-not-a-secret';

/**
 * The fixture backend still supplies the daemon's GraveInfo shape (`runtime`),
 * but the API's wire contract for `list_services` is `@graveshift/core`'s
 * ServiceView (`status`), which the SDK catalog validates. Keep the seam honest
 * by adapting only this tool reply; every other method stays the real fixture.
 */
const backend = Object.assign(new FakeMcpBackend(), {
  listServices: async (): Promise<Array<{ name: string; status: string }>> => [
    { name: 'api', status: 'healthy' },
  ],
});

/** Route the SDK's fetch to the real endpoint handler, as `@nestjs/mcp/testing` does. */
function endpointFetch(http: McpHttpService): FetchLike {
  return async (input, init) => {
    // The SDK's RequestInit and Bun's differ nominally; the runtime object is the same.
    const request = new Request(String(input), init as RequestInit);
    if (!request.headers.has('host')) {
      request.headers.set('host', new URL(request.url).host);
    }
    const { pathname, search } = new URL(request.url);
    const platformRequest = {
      method: request.method,
      url: pathname + search,
      headers: Object.fromEntries(request.headers),
    };
    return http.fetch(request, { platformRequest });
  };
}

describe('MCP client SDK against the real API endpoint (in-memory)', () => {
  let moduleRef!: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_BACKEND)
      .useValue(backend)
      .overrideProvider(MCP_POLICY)
      .useValue(policy)
      .overrideProvider(MCP_ENV_MODE)
      .useValue(undefined)
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  test('one import calls one tool and gets a typed result', async () => {
    await moduleRef.init();
    const http = moduleRef.get(McpHttpService, { strict: false });
    const mcp = createGraveshiftMcp({
      transport: 'streamable-http',
      url: 'http://localhost/mcp',
      credential: TOKEN,
      fetch: endpointFetch(http),
    });
    try {
      const services = await mcp.listServices();
      expect(services).toEqual([{ name: 'api', status: 'healthy' }]);

      const incidents = await mcp.listIncidents({ limit: 3 });
      expect(incidents).toHaveLength(3);
      expect(incidents[0]?.incident.service).toBe('api');

      const proposal = await mcp.proposeFix({ incidentId: 'inc1', action: 'open_pr' });
      expect(proposal.executed).toBe(false);
      expect(proposal.decision.effect).toBe('allow');

      const prompt = await mcp.triageIncident({ incidentId: 'inc1' });
      const text = prompt.messages[0]?.content;
      expect(text?.type === 'text' && text.text).toContain('Triage incident inc1');

      const markdown = await mcp.readPostmortem('inc1');
      expect(markdown).toContain('# Autopsy: api');
      expect(markdown).not.toContain(SECRET);
    } finally {
      await mcp.close();
    }
  });

  test('the SDK reaches the same endpoint over stdio through the API launcher', async () => {
    // The same stdio launcher the stdio e2e smoke test spawns: `src/stdio.ts`.
    // It has no authentication by design (ADR 0006), so no credential is passed.
    const stdioEntry = fileURLToPath(new URL('../src/stdio.ts', import.meta.url));
    const apiDir = fileURLToPath(new URL('../', import.meta.url));
    // Only PATH and the test-only boot vars from `test/setup.ts` reach the
    // child. No other variable, and no secret of the host, is forwarded. The
    // remaining boot settings (host, ports, URLs, NATS stream, gateway) have
    // schema defaults, and agents/policy come from the committed config file;
    // no AGENTS_PATH or POLICY_PATH exists.
    const env: Record<string, string> = {};
    for (const name of [
      'PATH',
      'DATABASE_URL',
      'GRAVESHIFT_API_INTERNAL_TOKEN',
      'GRAVESHIFT_DAEMON_INTERNAL_TOKEN',
      'GRAVESHIFT_OAUTH_JWT_SECRET',
    ] as const) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
    const mcp = createGraveshiftMcp({
      transport: 'stdio',
      command: process.execPath,
      args: [stdioEntry],
      cwd: apiDir,
      env,
      stderr: 'ignore',
    });
    try {
      const { tools } = await mcp.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'list_services',
          'list_incidents',
          'get_incident',
          'get_diagnosis',
          'get_audit_log',
          'verify_audit_chain',
          'propose_fix',
          'tail_logs',
          'query_metric',
        ]),
      );
      const { prompts } = await mcp.listPrompts();
      expect(prompts.map((prompt) => prompt.name)).toEqual(['triage_incident', 'write_postmortem']);
    } finally {
      await mcp.close();
    }
  }, 30_000);

  test('an unauthenticated direct handler call is refused by the bearer guard', async () => {
    const mcp = createGraveshiftMcp({
      transport: 'streamable-http',
      url: 'http://localhost/mcp',
      credential: 'whatever',
      // The route guard runs only on the real HTTP entry; simulate a refusal.
      fetch: (async () => new Response('unauthorized', { status: 401 })) as never,
    });
    try {
      await expect(mcp.listServices()).rejects.toBeInstanceOf(GraveshiftMcpAuthError);
    } finally {
      await mcp.close();
    }
  });
});
