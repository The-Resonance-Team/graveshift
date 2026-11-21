# Draft PR: add a custom request-handler hook to McpModule

Status: draft only. Do not open upstream from this branch. Base:
`nestjs/mcp` main. Closes the draft issue `issue-custom-jsonrpc-methods.md`.

## Problem

Applications cannot register a custom JSON-RPC method on the one `/mcp`
endpoint. They must use a private SDK field. See the draft issue for the
reproduction.

## Proposed change

Add an optional `onServer` callback to `McpModuleRootOptions`. Call it in
`McpServerFactory.create()` after the registry adds tools, resources and
prompts, and before the transport connects the server.

```ts
export interface McpModuleRootOptions {
  // existing fields
  onServer?: (server: McpServer, ctx: McpRequestContext) => void | Promise<void>;
}
```

In `mcp-server.factory.ts`:

```ts
const server = new McpServer(info, options);
// register primitives as today
await this.options.onServer?.(server, serving);
return server;
```

The callback runs for every server instance. HTTP builds one per request, and
stdio builds one per connection. The callback gets `serving.era` so an
application can register a 2026-only extension method.

## Proposed API notes

- Keep the name `onServer`. It matches the SDK term `McpServer`.
- Keep the callback synchronous in v1. An async callback adds ordering risk at
  connect time. A later release can widen the type.
- Do not export `McpServerFactory`. The hook is the supported path.
- Document that a hook must not replace a spec method handler.

## Test plan

1. Unit test: call `create()` with a hook that registers `acme/ping`; assert
   the handler is in `server.server._requestHandlers`.
2. In-memory client test: assert `acme/ping` answers and `tools/list` still
   answers on the same endpoint.
3. Assert a duplicate method name fails with a clear error.
4. Add a legacy and a modern client case to the same spec file.
5. Run `pnpm test:e2e` and the type check.
