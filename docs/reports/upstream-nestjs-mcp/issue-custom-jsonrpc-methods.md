# Draft issue: public hook for custom JSON-RPC methods

Status: draft only. Do not open upstream from this branch.

## Problem

`@nestjs/mcp` 0.0.4 registers only tools, resources, resource templates and
prompts. A server that needs a protocol extension must add custom JSON-RPC
methods on the same `/mcp` endpoint. The module has no supported hook for this.
`McpServerFactory` is not in the package `exports` map, so a local wrapper has
to reach a private field of the exported `McpStdioServer`. That field is not
part of the public type and can change in a minor release.

Affected client: an `io.modelcontextprotocol/events` client SDK, which calls
`events/list` and `events/poll` on the one endpoint. A second endpoint is not
allowed by the protocol.

## Minimal reproduction

```ts
@Module({
  imports: [McpModule.forRoot({ name: 'demo', version: '1.0.0' })],
})
class AppModule {}

// No public API exists to do this:
// const server = ???;
// server.server.setRequestHandler('acme/ping', { params: z.object({}) }, () => ({ ok: true }));
```

A client that sends `acme/ping` to `/mcp` gets `-32601 Method not found`.

## Proposed API

Expose the per-request server to application providers. One option is a hook
in the module options:

```ts
McpModule.forRoot({
  name: 'demo',
  version: '1.0.0',
  onServer(server: McpServer, ctx: McpRequestContext): void {
    server.server.setRequestHandler('acme/ping', { params: Ping }, () => ({ ok: true }));
  },
});
```

An alternative is to export `McpServerFactory` and let applications provide an
override. Either API must keep one `/mcp` endpoint and must not add a second
server.

## Test plan

1. Register `acme/ping` with the new hook and call it with the in-memory test
   client. Assert the result.
2. Call `tools/list`, `prompts/list` and `resources/templates/list`. Assert the
   existing primitives still answer on the same endpoint.
3. Assert that an unregistered method still answers `-32601`.
4. Run the legacy 2025-06-18 client test and the modern 2026-07-28 client test.
