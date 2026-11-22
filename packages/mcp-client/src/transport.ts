import {
  StreamableHTTPClientTransport,
  type FetchLike,
  type Transport,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { GraveshiftMcpConfigError } from './errors';
import type { Credential } from './credential';

/**
 * Transport selection. Two real transports reach the one MCP endpoint in
 * `apps/api/src/mcp`: Streamable HTTP against the running API, and stdio
 * against the API's stdio launcher (`apps/api/src/stdio.ts`). A `custom`
 * factory is the embedding seam for tests and in-process hosts.
 */
export interface StreamableHttpTransportConfig {
  transport: 'streamable-http';
  /** The endpoint URL, for example `http://127.0.0.1:3000/mcp`. */
  url: string | URL;
  /**
   * The bearer token for this client, passed by the caller. The package stores
   * no secret: a provider function is re-resolved before every request, and a
   * per-call override on any method replaces it for that call only.
   */
  credential: Credential;
  /** Custom fetch for embedding and tests. The SDK default is used when unset. */
  fetch?: FetchLike;
  /** Extra requestInit merged into every HTTP request (for example fixed headers). */
  requestInit?: RequestInit;
}

export interface StdioTransportConfig {
  transport: 'stdio';
  /** The command that starts the stdio launcher, for example `bun`. */
  command: string;
  args?: readonly string[];
  cwd?: string;
  /** Full child environment. Unset gives the SDK's safe default set. */
  env?: Record<string, string>;
  /** How to handle the child's stderr. Default `inherit`. */
  stderr?: 'inherit' | 'pipe' | 'ignore';
}

export interface CustomTransportConfig {
  transport: 'custom';
  /** Opens one transport per connect. The client owns closing it. */
  open: () => Transport | Promise<Transport>;
}

export type TransportConfig =
  | StreamableHttpTransportConfig
  | StdioTransportConfig
  | CustomTransportConfig;

export interface TransportRequestContext {
  /** Resolves the bearer for the current call: per-call override, then config. */
  credential: () => Promise<string>;
}

function validateCredentialText(value: string, where: string): string {
  if (value.trim().length === 0) {
    throw new GraveshiftMcpConfigError(`${where}: credential must not be empty`);
  }
  return value;
}

/** Build a fresh transport for one connect. Throws `GraveshiftMcpConfigError` on a bad config. */
export async function buildTransport(
  config: TransportConfig,
  context: TransportRequestContext,
): Promise<Transport> {
  switch (config.transport) {
    case 'streamable-http': {
      const authProvider = {
        token: async () => validateCredentialText(await context.credential(), 'streamable-http'),
      };
      const fetch = config.fetch;
      return new StreamableHTTPClientTransport(new URL(config.url), {
        authProvider,
        ...(fetch === undefined ? {} : { fetch }),
        ...(config.requestInit === undefined ? {} : { requestInit: config.requestInit }),
      });
    }
    case 'stdio': {
      // The stdio launcher has no authentication by design (ADR 0006), so it carries no credential.
      return new StdioClientTransport({
        command: config.command,
        ...(config.args === undefined ? {} : { args: [...config.args] }),
        ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
        ...(config.env === undefined ? {} : { env: config.env }),
        ...(config.stderr === undefined ? {} : { stderr: config.stderr }),
      });
    }
    case 'custom':
      return await config.open();
    default: {
      const kind = (config as { transport?: string }).transport;
      throw new GraveshiftMcpConfigError(`unknown transport ${String(kind)}`);
    }
  }
}
