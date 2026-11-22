import { InMemoryTransport, type FetchLike } from '@modelcontextprotocol/client';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { fileURLToPath } from 'node:url';

import { createGraveshiftMcp, type GraveshiftMcpClient } from './client';
import type { GraveshiftMcpClientBaseOptions } from './connection';
import type { Credential } from './credential';
import type { StdioTransportConfig } from './transport';
import { createFakeMcpServer, type FakeMcpServer } from './fixtures/fake-server';

/**
 * Test-only helpers at `@graveshift/mcp-client/testing`. They serve the fake
 * MCP server over the same transports the real client uses, so both transports
 * are covered without a live endpoint, socket or secret.
 */

export { createFakeMcpServer, type FakeMcpServer } from './fixtures/fake-server';
export {
  FAKE_AUDIT,
  FAKE_COUNTERS,
  FAKE_INCIDENT_ID,
  FAKE_INCIDENT_VIEWS,
  FAKE_LOG_LINES,
  FAKE_METRIC_VALUE,
  FAKE_POSTMORTEM,
  FAKE_SECRET,
  FAKE_SERVICES,
  fakeIncidentView,
  fakeLogText,
  fakeProposeFixResult,
} from './fixtures/data';

/** The credential every fake accepts when `requireBearer` is set. */
export const FAKE_TEST_TOKEN = 'sdk-test-token-not-a-secret';

/** The absolute path of the fake stdio server script, for `StdioClientTransport`. */
export function fakeStdioServerScript(): string {
  return fileURLToPath(new URL('./fixtures/stdio-server.ts', import.meta.url));
}

/** A ready `stdio` transport config that spawns the fake server under the current Bun. */
export function fakeStdioTransport(): StdioTransportConfig {
  return {
    transport: 'stdio',
    command: process.execPath,
    args: [fakeStdioServerScript()],
    stderr: 'ignore',
  };
}

/** A client already connected to the fake server over in-memory transports. */
export async function connectFakeInMemory(
  base: GraveshiftMcpClientBaseOptions = {},
): Promise<{ mcp: GraveshiftMcpClient; fake: FakeMcpServer; close: () => Promise<void> }> {
  const fake = createFakeMcpServer();
  const mcp = createGraveshiftMcp({
    ...base,
    transport: 'custom',
    open: async () => {
      const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
      await fake.server.connect(serverEnd);
      return clientEnd;
    },
  });
  return {
    mcp,
    fake,
    close: async () => {
      await mcp.close();
      await fake.close();
    },
  };
}

export interface FakeHttpOptions {
  /** When set, every request must carry exactly `Authorization: Bearer <token>`. */
  requireBearer?: string;
  /** Fail this many of the first HTTP requests with a transport-level `fetch failed`. */
  failFirstRequests?: number;
}

export interface FakeHttpHandle {
  /** The fake endpoint URL, for the client's `url` option. */
  readonly url: URL;
  /**
   * A `fetch` that delivers requests to the fake handler in-process. The real
   * Streamable HTTP transport runs above it; no socket is opened.
   */
  readonly fetch: FetchLike;
  /** Authorization headers the fake saw, in arrival order. */
  readonly seenAuthorizations: readonly string[];
  /** HTTP requests the fake handled, in arrival order (including failures). */
  readonly requestCount: () => number;
  close: () => Promise<void>;
}

/** Starts the fake MCP server behind an in-process Streamable HTTP handler. */
export async function startFakeHttp(options: FakeHttpOptions = {}): Promise<FakeHttpHandle> {
  const fake = createFakeMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Session mode: one transport answers every request of one client.
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await fake.server.connect(transport);
  const seenAuthorizations: string[] = [];
  const url = new URL('http://mcp.fake.local/mcp');
  let remainingFailures = options.failFirstRequests ?? 0;
  let requests = 0;

  const handle: FakeHttpHandle = {
    url,
    seenAuthorizations,
    requestCount: () => requests,
    fetch: async (input, init) => {
      requests += 1;
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new TypeError('fetch failed');
      }
      // The SDK's RequestInit and Bun's differ nominally; the runtime object is the same.
      const request = new Request(String(input), init as RequestInit);
      const authorization = request.headers.get('authorization');
      seenAuthorizations.push(authorization ?? '');
      if (options.requireBearer !== undefined) {
        if (authorization !== `Bearer ${options.requireBearer}`) {
          return new Response('unauthorized', { status: 401 });
        }
      }
      return transport.handleRequest(request);
    },
    close: async () => {
      await transport.close().catch(() => undefined);
      await fake.close();
    },
  };
  return handle;
}

/** A client connected to the in-process fake over the real Streamable HTTP transport. */
export async function connectFakeHttp(
  base: GraveshiftMcpClientBaseOptions & { credential?: Credential; requireBearer?: string } = {},
): Promise<{ mcp: GraveshiftMcpClient; http: FakeHttpHandle; close: () => Promise<void> }> {
  const credential = base.credential ?? FAKE_TEST_TOKEN;
  const requireBearer =
    base.requireBearer ?? (typeof credential === 'string' ? credential : undefined);
  const http = await startFakeHttp(requireBearer === undefined ? {} : { requireBearer });
  const mcp = createGraveshiftMcp({
    ...base,
    credential,
    transport: 'streamable-http',
    url: http.url,
    fetch: http.fetch,
  });
  return {
    mcp,
    http,
    close: async () => {
      await mcp.close();
      await http.close();
    },
  };
}
