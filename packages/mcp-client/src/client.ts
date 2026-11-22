import type {
  GetPromptResult,
  ListPromptsResult,
  ListResourceTemplatesResult,
  ListToolsResult,
} from '@modelcontextprotocol/client';
import type { z } from 'zod';

import {
  POSTMORTEM_MIME_TYPE,
  POSTMORTEM_URI_TEMPLATE,
  promptArgsSchemas,
  toolInputSchemas,
  type PromptName,
  type ToolName,
} from './catalog';
import { McpConnection, type CallOptions, type GraveshiftMcpOptions } from './connection';
import { GraveshiftMcpToolError, GraveshiftMcpValidationError } from './errors';
import { firstTextBlock, parseToolReply, promptArgsToStrings, singleTextResource } from './reply';
import {
  AuditEntryViewsSchema,
  ChainResultSchema,
  DiagnosisViewSchema,
  IncidentViewsSchema,
  IncidentViewSchema,
  MetricValueSchema,
  ProposeFixResultSchema,
  ServiceViewsSchema,
} from './schemas';

type Input<S> = S extends z.ZodType ? z.input<S> : never;

/**
 * The typed primitive layer over `McpConnection`. Every method speaks typed
 * inputs and replies; every failure is a `GraveshiftMcpError`. Build it with
 * `createGraveshiftMcp`.
 */
export class GraveshiftMcpClient extends McpConnection {
  listServices(options?: CallOptions): Promise<z.output<typeof ServiceViewsSchema>> {
    return this.#tool('list_services', undefined, ServiceViewsSchema, options);
  }

  listIncidents(
    input: Input<(typeof toolInputSchemas)['list_incidents']> = {},
    options?: CallOptions,
  ): Promise<z.output<typeof IncidentViewsSchema>> {
    return this.#tool('list_incidents', input, IncidentViewsSchema, options);
  }

  getIncident(
    input: Input<(typeof toolInputSchemas)['get_incident']>,
    options?: CallOptions,
  ): Promise<z.output<typeof IncidentViewSchema>> {
    return this.#tool('get_incident', input, IncidentViewSchema, options);
  }

  getDiagnosis(
    input: Input<(typeof toolInputSchemas)['get_diagnosis']>,
    options?: CallOptions,
  ): Promise<Record<string, unknown>> {
    return this.#tool('get_diagnosis', input, DiagnosisViewSchema, options);
  }

  getAuditLog(
    input: Input<(typeof toolInputSchemas)['get_audit_log']> = {},
    options?: CallOptions,
  ): Promise<z.output<typeof AuditEntryViewsSchema>> {
    return this.#tool('get_audit_log', input, AuditEntryViewsSchema, options);
  }

  verifyAuditChain(options?: CallOptions): Promise<z.output<typeof ChainResultSchema>> {
    return this.#tool('verify_audit_chain', undefined, ChainResultSchema, options);
  }

  proposeFix(
    input: Input<(typeof toolInputSchemas)['propose_fix']>,
    options?: CallOptions,
  ): Promise<z.output<typeof ProposeFixResultSchema>> {
    return this.#tool('propose_fix', input, ProposeFixResultSchema, options);
  }

  /**
   * Raw log text wrapped by the server in `<untrusted_logs>`. The wrapper stays:
   * the content is untrusted data, never instructions.
   */
  tailLogs(
    input: Input<(typeof toolInputSchemas)['tail_logs']>,
    options?: CallOptions,
  ): Promise<string> {
    return this.#toolRaw('tail_logs', input, options, (text) => text);
  }

  async queryMetric(
    input: Input<(typeof toolInputSchemas)['query_metric']>,
    options?: CallOptions,
  ): Promise<number | null> {
    const reply = await this.#tool('query_metric', input, MetricValueSchema, options);
    return reply.value;
  }

  /** One of the two prompts the API serves. The reply type comes from the MCP SDK. */
  getPrompt(
    name: PromptName,
    args: Input<(typeof promptArgsSchemas)[typeof name]>,
    options?: CallOptions,
  ): Promise<GetPromptResult> {
    return this.#prompt(name, args, options);
  }

  triageIncident(
    input: Input<(typeof promptArgsSchemas)['triage_incident']>,
    options?: CallOptions,
  ): Promise<GetPromptResult> {
    return this.#prompt('triage_incident', input, options);
  }

  writePostmortem(
    input: Input<(typeof promptArgsSchemas)['write_postmortem']>,
    options?: CallOptions,
  ): Promise<GetPromptResult> {
    return this.#prompt('write_postmortem', input, options);
  }

  /**
   * Reads `graveshift://incidents/{id}/postmortem` and returns the Autopsy
   * markdown. Throws `GraveshiftMcpProtocolError` when the incident has no postmortem.
   */
  async readPostmortem(incidentId: string, options?: CallOptions): Promise<string> {
    if (typeof incidentId !== 'string' || incidentId.length === 0 || incidentId.length > 128) {
      throw new GraveshiftMcpValidationError(
        'readPostmortem: incidentId must be 1..128 characters',
      );
    }
    const uri = POSTMORTEM_URI_TEMPLATE.replace('{id}', encodeURIComponent(incidentId));
    const result = await this.withConnection(
      `readResource ${uri}`,
      (client, requestOptions) => client.readResource({ uri }, requestOptions),
      options,
    );
    return singleTextResource(result, uri, POSTMORTEM_MIME_TYPE);
  }

  /** Raw `tools/list`, typed by the MCP SDK, for callers that want the live catalog. */
  listTools(options?: CallOptions): Promise<ListToolsResult> {
    return this.withConnection(
      'listTools',
      (client, requestOptions) => client.listTools({}, requestOptions),
      options,
    );
  }

  /** Raw `prompts/list`, typed by the MCP SDK. */
  listPrompts(options?: CallOptions): Promise<ListPromptsResult> {
    return this.withConnection(
      'listPrompts',
      (client, requestOptions) => client.listPrompts({}, requestOptions),
      options,
    );
  }

  /** Raw `resources/templates/list`, typed by the MCP SDK. */
  listResourceTemplates(options?: CallOptions): Promise<ListResourceTemplatesResult> {
    return this.withConnection(
      'listResourceTemplates',
      (client, requestOptions) => client.listResourceTemplates({}, requestOptions),
      options,
    );
  }

  /** Raw `ping` for liveness. */
  async ping(options?: CallOptions): Promise<void> {
    await this.withConnection(
      'ping',
      (client, requestOptions) => client.ping(requestOptions),
      options,
    );
  }

  // Runs one tool: local input check, bounded retry, typed reply parse or tool denial.
  async #tool<T>(
    name: ToolName,
    input: Record<string, unknown> | undefined,
    schema: z.ZodType<T>,
    options?: CallOptions,
  ): Promise<T> {
    return this.#toolRaw(name, input, options, (text) => parseToolReply(name, text, schema));
  }

  async #toolRaw<T>(
    name: ToolName,
    input: Record<string, unknown> | undefined,
    options: CallOptions | undefined,
    toOutput: (text: string) => T,
  ): Promise<T> {
    this.#checkToolInput(name, input);
    return this.withConnection(
      `tool ${name}`,
      async (client, requestOptions) => {
        const result = await client.callTool(
          { name, ...(input === undefined ? {} : { arguments: input }) },
          requestOptions,
        );
        const text = firstTextBlock(result, `tool ${name}`);
        if (result.isError) throw new GraveshiftMcpToolError(name, text);
        return toOutput(text);
      },
      options,
    );
  }

  async #prompt(
    name: PromptName,
    args: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<GetPromptResult> {
    const parsed = promptArgsSchemas[name].safeParse(args);
    if (!parsed.success) {
      throw new GraveshiftMcpValidationError(
        `prompt ${name}: arguments do not match the contract`,
        {
          issues: parsed.error.issues,
          cause: parsed.error,
        },
      );
    }
    // The MCP spec carries prompt arguments as strings; both catalog schemas only allow strings.
    const promptArgs = promptArgsToStrings(parsed.data as Record<string, unknown>);
    return this.withConnection(
      `prompt ${name}`,
      (client, requestOptions) => client.getPrompt({ name, arguments: promptArgs }, requestOptions),
      options,
    );
  }

  #checkToolInput(name: ToolName, input: Record<string, unknown> | undefined): void {
    const schema = toolInputSchemas[name];
    if (schema === undefined) return;
    const parsed = schema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new GraveshiftMcpValidationError(`tool ${name}: input does not match the contract`, {
        issues: parsed.error.issues,
        cause: parsed.error,
      });
    }
  }
}

/** Builds one typed client for the existing MCP endpoint. One import, one call. */
export function createGraveshiftMcp(options: GraveshiftMcpOptions): GraveshiftMcpClient {
  return new GraveshiftMcpClient(options);
}
