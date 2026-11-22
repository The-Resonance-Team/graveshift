import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';

import { GRAVESHIFT_MCP_CATALOG } from './catalog';
import { checkCatalogDrift, collectServerPrimitives, type ServerPrimitiveCatalog } from './drift';

/**
 * Drift check against the API. The three MCP provider classes of
 * `apps/api/src/mcp` carry their registration in `@Tool()`, `@Prompt()` and
 * `@ResourceTemplate()` metadata. This test reads that metadata and compares
 * it with the client catalog. It is the `drift:check` gate run inside the
 * suite: no network, no Nest boot, no fake endpoint.
 * The classes must load after `reflect-metadata`, so they are imported at
 * runtime by computed URL: the API is the authority and this package does not
 * compile its Nest sources (they live under `apps/api`, with its own compiler
 * options).
 */
const mcpDir = new URL('../../../apps/api/src/mcp/', import.meta.url);
const loadApiModule = (file: string): Promise<Record<string, unknown>> =>
  import(new URL(file, mcpDir).href);

const [{ McpPrompts }, { McpResources }, { McpTools }] = await Promise.all([
  loadApiModule('mcp.prompts.ts'),
  loadApiModule('mcp.resources.ts'),
  loadApiModule('mcp.tools.ts'),
]);

function serverCatalog(): ServerPrimitiveCatalog {
  return collectServerPrimitives([McpTools, McpPrompts, McpResources]);
}

describe('catalog drift against apps/api/src/mcp', () => {
  test('the catalog matches the nine tools, two prompts and the postmortem resource', () => {
    const server = serverCatalog();
    expect(server.tools.map((tool) => tool.name).sort()).toEqual([
      'get_audit_log',
      'get_diagnosis',
      'get_incident',
      'list_incidents',
      'list_services',
      'propose_fix',
      'query_metric',
      'tail_logs',
      'verify_audit_chain',
    ]);
    expect(server.prompts.map((prompt) => prompt.name)).toEqual([
      'triage_incident',
      'write_postmortem',
    ]);
    expect(server.resourceTemplates).toHaveLength(1);

    const report = checkCatalogDrift(server, GRAVESHIFT_MCP_CATALOG);
    expect(report.mismatches).toEqual([]);
    expect(report.match).toBe(true);
  });

  test('a changed tool description fails the check', () => {
    const server = serverCatalog();
    const mutated: ServerPrimitiveCatalog = {
      ...server,
      tools: server.tools.map((tool) =>
        tool.name === 'list_services' ? { ...tool, description: 'Renamed by the API.' } : tool,
      ),
    };
    const report = checkCatalogDrift(mutated, GRAVESHIFT_MCP_CATALOG);
    expect(report.match).toBe(false);
    expect(
      report.mismatches.some(
        (m) => m.primitive === 'tool list_services' && m.field === 'description',
      ),
    ).toBe(true);
  });

  test('a changed input schema fails the check', () => {
    const server = serverCatalog();
    const mutated: ServerPrimitiveCatalog = {
      ...server,
      tools: server.tools.map((tool) =>
        tool.name === 'list_incidents' ? { ...tool, inputSchema: undefined } : tool,
      ),
    };
    const report = checkCatalogDrift(mutated, GRAVESHIFT_MCP_CATALOG);
    expect(report.match).toBe(false);
    expect(report.mismatches.some((m) => m.field === 'inputSchema')).toBe(true);
  });

  test('a tool the API adds without a client wrapper fails the check', () => {
    const server = serverCatalog();
    const mutated: ServerPrimitiveCatalog = {
      ...server,
      tools: [
        ...server.tools,
        { name: 'new_tool', description: 'unannounced', inputSchema: undefined },
      ],
    };
    const report = checkCatalogDrift(mutated, GRAVESHIFT_MCP_CATALOG);
    expect(report.match).toBe(false);
    expect(report.mismatches.some((m) => m.primitive === 'tool new_tool')).toBe(true);
  });
});
