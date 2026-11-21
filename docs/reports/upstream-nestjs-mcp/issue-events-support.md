# Draft issue: Events extension support in the MCP SDK

Status: draft only. Do not open upstream from this branch. Target: the
`@modelcontextprotocol/server` SDK and, after that, `@nestjs/mcp`.

## Problem

SEP-3415 (`io.modelcontextprotocol/events`) is Final and the extension is Beta.
The 2.4.0 SDK has no `events/*` method. It also has no generic `ServerExtension`
type in a release. An application that wants poll delivery must define the five
methods, the Event occurrence shape, the Cursor rules and the capability
negotiation itself.

Affected client: any `ext-events` client SDK that discovers event types with
`events/list` and polls with `events/poll`. Without SDK support, each server
implementation can use a different wire shape.

## Minimal reproduction

```ts
import { McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'demo', version: '1.0.0' });
// No supported call exists for this:
// server.events.register({ name: 'incident.changed', inputSchema, payloadSchema, poll: check });
```

A client that calls `events/list` gets `-32601 Method not found`.

## Proposed API

```ts
interface EventDescriptor {
  name: string;
  description?: string;
  delivery: ('poll' | 'push' | 'webhook')[];
  inputSchema: StandardSchemaV1;
  payloadSchema: StandardSchemaV1;
}

interface PollCheck {
  (
    args: Record<string, unknown>,
    cursor: string | null,
    limits: { maxAgeMs?: number; maxEvents?: number },
    ctx: ServerContext,
  ): Promise<{
    events: EventOccurrence[];
    cursor: string | null;
    truncated: boolean;
    hasMore: boolean;
    nextPollMs?: number;
  }>;
}

server.events.register(descriptor, check, { listChanged: false });
```

The SDK owns method registration, result typing, capability advertisement and
error codes (`-32023`, `-32024`, `-32025`, `-32026`, `-32027`). The application
owns the check function and the Cursor encoding.

## Test plan

1. Register one event type with `delivery: ['poll']`. Assert `events/list`
   returns the descriptor with schemas and the capability with
   `listChanged: false`.
2. Poll with a `null` cursor. Assert empty events and a fresh cursor. Push one
   occurrence into a fake source, then poll with the cursor. Assert the
   occurrence and the new cursor.
3. Assert `hasMore`, `truncated`, `maxAgeMs`, `maxEvents` and deduplication by
   `eventId`.
4. Assert `Forbidden` when the principal lacks the declared scope, and
   `NotFound` for an unknown name.
5. Assert a legacy 2025-06-18 client gets `-32601` and no capability.
