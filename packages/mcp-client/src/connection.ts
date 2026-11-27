import {
  Client,
  type Client as McpSdkClient,
  type RequestOptions,
  type Transport,
} from '@modelcontextprotocol/client';

import { resolveCredential, type Credential } from './credential';
import { GraveshiftMcpConfigError, toGraveshiftMcpError } from './errors';
import { normalizeRetryPolicy, withRetry, type RetryHooks } from './retry';
import { buildTransport, type TransportConfig } from './transport';

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 60_000;

/** Options every client takes, beside the transport fields. */
export interface GraveshiftMcpClientBaseOptions {
  /** MCP clientInfo name sent on connect. */
  clientName?: string;
  /** MCP clientInfo version sent on connect. */
  clientVersion?: string;
  /** Bound for one request, including the handshake. Default 10 000 ms. */
  timeoutMs?: number;
  /** Extra bounded tries after the first attempt. Default 2, ceiling 5. */
  maxRetries?: number;
  /** Base backoff in milliseconds. Default 250. */
  retryBaseDelayMs?: number;
  /** Upper bound for one backoff in milliseconds. Default 5 000. */
  retryMaxDelayMs?: number;
  /** Notified before each bounded retry. */
  onRetry?: RetryHooks['onRetry'];
}

export type GraveshiftMcpOptions = GraveshiftMcpClientBaseOptions & TransportConfig;

/** Per-call options. A credential passed here applies to this call only. */
export interface CallOptions {
  /** Overrides the client credential for this call. Nothing is stored after it. */
  credential?: Credential;
  /** Overrides the client request bound for this call. */
  timeoutMs?: number;
  /** Cancels this call. */
  signal?: AbortSignal;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * The connection layer: transport selection, lazy connect, bounded retry,
 * per-call credentials and the single-flight queue. The typed wrappers in
 * `GraveshiftMcpClient` run every request through `withConnection`.
 */
export class McpConnection {
  readonly #config: GraveshiftMcpOptions;
  readonly #retry: ReturnType<typeof normalizeRetryPolicy>;
  readonly #timeoutMs: number;
  readonly #clientInfo: { name: string; version: string };
  readonly #retryHooks: RetryHooks;
  #queue: Promise<unknown> = Promise.resolve();
  #activeCredential: Credential | undefined;
  #client: McpSdkClient | undefined;

  constructor(options: GraveshiftMcpOptions) {
    if (options.transport === 'streamable-http' && options.credential === undefined) {
      throw new GraveshiftMcpConfigError('streamable-http: the caller must pass a credential');
    }
    if (options.transport === 'custom' && typeof options.open !== 'function') {
      throw new GraveshiftMcpConfigError('custom: an open() factory is required');
    }
    this.#config = options;
    this.#retry = normalizeRetryPolicy(options);
    this.#timeoutMs = clamp(options.timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    this.#clientInfo = {
      name: options.clientName ?? 'graveshift-mcp-client',
      version: options.clientVersion ?? '0.1.0',
    };
    this.#retryHooks = options.onRetry === undefined ? {} : { onRetry: options.onRetry };
  }

  /** True while one live connection exists. */
  get isConnected(): boolean {
    return this.#client !== undefined;
  }

  /** Opens the connection early. Calls connect on demand when skipped. */
  connect(): Promise<void> {
    return this.#serialize(async () => {
      await this.#ensureConnected();
    });
  }

  /** Closes the connection and, for stdio, the child process. Safe to call twice. */
  close(): Promise<void> {
    return this.#serialize(async () => {
      await this.#reset();
    });
  }

  /**
   * Runs one request over the live connection with bounded retry. One task at
   * a time: the per-call credential and the single connection stay consistent.
   * The connection is dropped only when the transport itself failed.
   */
  protected withConnection<T>(
    label: string,
    task: (client: McpSdkClient, requestOptions: RequestOptions) => Promise<T>,
    options?: CallOptions,
  ): Promise<T> {
    return this.#serialize(async () => {
      const previous = this.#activeCredential;
      if (options?.credential !== undefined) this.#activeCredential = options.credential;
      try {
        return await withRetry(
          this.#retry,
          label,
          async () => {
            try {
              const client = await this.#ensureConnected();
              return await task(client, {
                timeout: options?.timeoutMs ?? this.#timeoutMs,
                ...(options?.signal === undefined ? {} : { signal: options.signal }),
              });
            } catch (error) {
              if (toGraveshiftMcpError(error, label).retryable) await this.#reset();
              throw error;
            }
          },
          this.#retryHooks,
        );
      } finally {
        this.#activeCredential = previous;
      }
    });
  }

  #serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = () => task();
    const settled = this.#queue.then(run, run);
    this.#queue = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  async #ensureConnected(): Promise<McpSdkClient> {
    if (this.#client) return this.#client;
    const transport: Transport = await buildTransport(this.#config, {
      credential: () => this.#resolveToken(),
    });
    const client = new Client(this.#clientInfo);
    try {
      await client.connect(transport, { timeout: this.#timeoutMs });
    } catch (error) {
      await transport.close().catch(() => undefined);
      throw error;
    }
    client.onclose = () => {
      if (this.#client === client) this.#client = undefined;
    };
    this.#client = client;
    return client;
  }

  async #reset(): Promise<void> {
    const client = this.#client;
    this.#client = undefined;
    if (client) await client.close().catch(() => undefined);
  }

  async #resolveToken(): Promise<string> {
    const config = this.#config;
    if (config.transport !== 'streamable-http') {
      throw new GraveshiftMcpConfigError('this transport serves no bearer token');
    }
    const credential = this.#activeCredential ?? config.credential;
    const value = await resolveCredential(credential);
    if (value.trim().length === 0) {
      throw new GraveshiftMcpConfigError('the caller must pass a non-empty credential');
    }
    return value;
  }
}
