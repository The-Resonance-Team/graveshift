/**
 * `@graveshift/mcp-client` — the MCP client SDK for the Graveshift API endpoint
 * in `apps/api/src/mcp`. One import, one typed call, no second MCP server.
 *
 * ```ts
 * import { createGraveshiftMcp } from '@graveshift/mcp-client';
 *
 * const mcp = createGraveshiftMcp({
 *   transport: 'streamable-http',
 *   url: 'http://127.0.0.1:3000/mcp',
 *   credential: token, // the caller passes the credential; the package stores none
 * });
 * const services = await mcp.listServices();
 * await mcp.close();
 * ```
 *
 * Test helpers (fake server and fixtures) live at `@graveshift/mcp-client/testing`.
 * Reply envelope types come from `@modelcontextprotocol/client`; import them from
 * that package when a caller needs them.
 */
export { createGraveshiftMcp, GraveshiftMcpClient } from './client';
export {
  McpConnection,
  type CallOptions,
  type GraveshiftMcpClientBaseOptions,
  type GraveshiftMcpOptions,
} from './connection';
export {
  MCP_SERVER_INFO,
  POSTMORTEM_MIME_TYPE,
  POSTMORTEM_URI_TEMPLATE,
  PROMPT_NAMES,
  promptArgsSchemas,
  GRAVESHIFT_MCP_CATALOG,
  RESOURCE_TEMPLATE_SPECS,
  TOOL_NAMES,
  TOOL_SPECS,
  toolInputSchemas,
  type PromptName,
  type PromptSpec,
  type ResourceTemplateSpec,
  type ToolName,
  type ToolSpec,
} from './catalog';
export type { Credential } from './credential';
export { resolveCredential } from './credential';
/** Re-exported so callers can type a custom `fetch` (tests, proxies) without depending on the MCP SDK directly. */
export type { FetchLike } from '@modelcontextprotocol/client';
export {
  GraveshiftMcpAuthError,
  GraveshiftMcpConfigError,
  GraveshiftMcpError,
  GraveshiftMcpProtocolError,
  GraveshiftMcpTimeoutError,
  GraveshiftMcpToolError,
  GraveshiftMcpTransportError,
  GraveshiftMcpValidationError,
  toGraveshiftMcpError,
  type GraveshiftMcpErrorKind,
} from './errors';
export {
  AuditEntryViewSchema,
  AuditEntryViewsSchema,
  ChainResultSchema,
  CounterSourceSchema,
  DiagnosisViewSchema,
  IncidentViewsSchema,
  IncidentViewSchema,
  LimitCountersSchema,
  MetricValueSchema,
  PolicyAuditEventSchema,
  PolicyDecisionSchema,
  PolicyEffectSchema,
  PolicyLimitsSchema,
  PolicyModeSchema,
  ProposeFixResultSchema,
  ServiceViewsSchema,
  type AuditEntryView,
  type ChainResult,
  type CounterSource,
  type DiagnosisView,
  type IncidentView,
  type LimitCounters,
  type PolicyAuditEvent,
  type PolicyDecision,
  type PolicyEffect,
  type PolicyLimits,
  type PolicyMode,
  type ProposeFixResult,
  type ServiceView,
} from './schemas';
export {
  DEFAULT_MAX_RETRIES,
  MAX_RETRIES_CEILING,
  normalizeRetryPolicy,
  retryDelayMs,
  withRetry,
  type RetryHooks,
  type RetryPolicy,
} from './retry';
export {
  buildTransport,
  type CustomTransportConfig,
  type StdioTransportConfig,
  type StreamableHttpTransportConfig,
  type TransportConfig,
} from './transport';
