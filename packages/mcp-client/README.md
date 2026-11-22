# @graveshift/mcp-client

The typed MCP client SDK for the Graveshift API MCP endpoint in
`apps/api/src/mcp`. It connects to the one existing endpoint. It adds no
second MCP server and duplicates no tools, prompts or resources.

## Use

Streamable HTTP against the running API. The caller passes the credential;
the package stores none and reads no secret from the environment or disk.

```ts
import { createGraveshiftMcp } from '@graveshift/mcp-client';

const mcp = createGraveshiftMcp({
  transport: 'streamable-http',
  url: 'http://127.0.0.1:3000/mcp',
  credential: issuedMcpToken, // string, or a provider called before every request
});

const services = await mcp.listServices(); // typed: ServiceView[]
const proposal = await mcp.proposeFix({ incidentId: 'inc1', action: 'open_pr' }); // typed, executed: false
const markdown = await mcp.readPostmortem('inc1'); // Autopsy markdown
await mcp.close();
```

A per-call credential override applies to that call only:

```ts
await mcp.listServices({ credential: otherToken });
```

stdio against the API's stdio launcher (no authentication by design, ADR 0006):

```ts
const mcp = createGraveshiftMcp({
  transport: 'stdio',
  command: 'bun',
  args: ['apps/api/src/stdio.ts'],
  cwd: '.',
});
```

## Guarantees

- Typed wrappers for the nine tools, two prompts and the postmortem resource.
  Envelope types (`CallToolResult`, `GetPromptResult`, `ReadResourceResult`)
  come from `@modelcontextprotocol/client`. Shared wire shapes come from
  `@graveshift/core`.
- Bounded retry with exponential backoff on transport failures only.
  `maxRetries` defaults to 2 and is clamped to 5.
- Typed errors. Every failure extends `GraveshiftMcpError` with `kind` and
  `retryable`: `GraveshiftMcpAuthError`, `GraveshiftMcpTransportError`,
  `GraveshiftMcpTimeoutError`, `GraveshiftMcpProtocolError`,
  `GraveshiftMcpToolError`, `GraveshiftMcpValidationError`,
  `GraveshiftMcpConfigError`.
- No secret storage. No dashboard UI. No live endpoint in tests.

## Drift check

`src/catalog.ts` mirrors the endpoint's primitives. The API stays the
authority. The test `src/drift.test.ts` and the script
`bun run --filter @graveshift/mcp-client drift:check` compare the catalog with
the `@Tool()`, `@Prompt()` and `@ResourceTemplate()` metadata of
`apps/api/src/mcp` and fail closed on any mismatch. Update the catalog in the
same PR that changes the endpoint.

## Tests

`@graveshift/mcp-client/testing` serves a fake MCP server (the same primitive
set, fixture replies, no network) over in-memory, Streamable HTTP and stdio
transports. `apps/api/test/mcp-sdk.e2e.test.ts` proves one import calls one
tool through the real endpoint handler in memory.
