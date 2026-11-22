/**
 * Drift check entry point. Loads the three MCP provider classes from
 * `apps/api/src/mcp`, reads their decorator metadata and compares it with the
 * client catalog. Exits 1 on any mismatch. No network call, no Nest boot.
 *
 * Run with `bun run --filter @graveshift/mcp-client drift:check`.
 */
import 'reflect-metadata';

import { GRAVESHIFT_MCP_CATALOG } from '../src/catalog';
import { checkCatalogDrift, collectServerPrimitives } from '../src/drift';

// The API classes must load after `reflect-metadata`, so they are imported at
// runtime by computed URL: this package does not compile the API's Nest sources
// (they live under `apps/api`, with its own compiler options).
const mcpDir = new URL('../../../apps/api/src/mcp/', import.meta.url);
const loadApiModule = (file: string): Promise<Record<string, unknown>> =>
  import(new URL(file, mcpDir).href);

const [{ McpPrompts }, { McpResources }, { McpTools }] = await Promise.all([
  loadApiModule('mcp.prompts.ts'),
  loadApiModule('mcp.resources.ts'),
  loadApiModule('mcp.tools.ts'),
]);

const server = collectServerPrimitives([McpTools, McpPrompts, McpResources]);
const report = checkCatalogDrift(server, GRAVESHIFT_MCP_CATALOG);

if (!report.match) {
  console.error('mcp-client drift: the API and the client catalog disagree.');
  for (const mismatch of report.mismatches) {
    console.error(
      `- ${mismatch.primitive}: ${mismatch.field} expected <${mismatch.expected}> got <${mismatch.actual}>`,
    );
  }
  console.error('Update packages/mcp-client/src/catalog.ts to match apps/api/src/mcp.');
  process.exit(1);
}

process.stdout.write(
  `mcp-client drift: ok (${String(server.tools.length)} tools, ${String(server.prompts.length)} prompts, ${String(server.resourceTemplates.length)} resource templates)\n`,
);
