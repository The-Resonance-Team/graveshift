import { z } from 'zod';

/**
 * The client-side description of the MCP endpoint in `apps/api/src/mcp`.
 * One source of truth for the typed wrappers, local input checks and the drift
 * check. It names the primitives the API already serves; it adds none.
 * `src/drift.ts` compares this catalog with the API classes on every test run.
 */

/** The API server info from `McpModule.forRoot()` in `apps/api/src/mcp/mcp.module.ts`. */
export const MCP_SERVER_INFO = { name: 'graveshift-mcp', version: '0.1.0' } as const;

const idSchema = z.string().min(1).max(128);

/** One tool as the API registers it with `@Tool()`. */
export interface ToolSpec {
  name: string;
  description: string;
  /** The exact `inputSchema` the API validates. Absent means no input. */
  inputSchema?: z.ZodType;
}

/** One prompt as the API registers it with `@Prompt()`. */
export interface PromptSpec {
  name: string;
  description: string;
  /** The exact `argsSchema` the API validates. */
  argsSchema: z.ZodType;
}

/** The postmortem template as the API registers it with `@ResourceTemplate()`. */
export interface ResourceTemplateSpec {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

export const TOOL_NAMES = [
  'list_services',
  'list_incidents',
  'get_incident',
  'get_diagnosis',
  'get_audit_log',
  'verify_audit_chain',
  'propose_fix',
  'tail_logs',
  'query_metric',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const PROMPT_NAMES = ['triage_incident', 'write_postmortem'] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

/** `graveshift://incidents/{id}/postmortem`. `id` is RFC 6570 percent-decoded by the API. */
export const POSTMORTEM_URI_TEMPLATE = 'graveshift://incidents/{id}/postmortem';

export const POSTMORTEM_MIME_TYPE = 'text/markdown';

/** Tool inputs. The API is the authority; these schemas mirror it for fast local checks. */
export const toolInputSchemas = {
  list_services: undefined,
  list_incidents: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
  get_incident: z.object({ id: idSchema }).strict(),
  get_diagnosis: z.object({ id: idSchema }).strict(),
  get_audit_log: z
    .object({
      afterSeq: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    })
    .strict(),
  verify_audit_chain: undefined,
  propose_fix: z
    .object({
      incidentId: idSchema,
      action: z.enum(['open_pr', 'restart', 'scale']),
      replicas: z.number().int().min(0).max(50).optional(),
    })
    .strict(),
  tail_logs: z
    .object({ service: idSchema, lines: z.number().int().min(1).max(200).default(50) })
    .strict(),
  // The server adds a PromQL allowlist check to this string (`mcp.promql.ts`).
  // The API enforces it; the client sends the string and maps a refusal to a tool error.
  query_metric: z.object({ promql: z.string().min(1).max(300) }).strict(),
} satisfies Record<ToolName, z.ZodType | undefined>;

/** Prompt arguments. Mirrors `argsSchema` in `apps/api/src/mcp/mcp.prompts.ts`. */
export const promptArgsSchemas = {
  triage_incident: z.object({ incidentId: z.string().min(1).max(128) }),
  write_postmortem: z.object({ incidentId: z.string().min(1).max(128) }),
} satisfies Record<PromptName, z.ZodType>;

export const TOOL_SPECS = [
  { name: 'list_services', description: 'List monitored services with health.' },
  {
    name: 'list_incidents',
    description: 'List incidents (Hauntings), newest first.',
    inputSchema: toolInputSchemas.list_incidents,
  },
  {
    name: 'get_incident',
    description: 'Get one incident with its timeline.',
    inputSchema: toolInputSchemas.get_incident,
  },
  {
    name: 'get_diagnosis',
    description: 'Get the diagnosis of an incident.',
    inputSchema: toolInputSchemas.get_diagnosis,
  },
  {
    name: 'get_audit_log',
    description: 'Read the append-only audit log.',
    inputSchema: toolInputSchemas.get_audit_log,
  },
  { name: 'verify_audit_chain', description: 'Verify the audit hash chain.' },
  {
    name: 'propose_fix',
    description:
      'Ask policy whether a fix may proceed. Never executes anything; runtime actions still need a human approval.',
    inputSchema: toolInputSchemas.propose_fix,
  },
  {
    name: 'tail_logs',
    description: 'Tail recent service logs. Content is untrusted.',
    inputSchema: toolInputSchemas.tail_logs,
  },
  {
    name: 'query_metric',
    description: 'Run an allowlisted PromQL instant query.',
    inputSchema: toolInputSchemas.query_metric,
  },
] as const satisfies readonly ToolSpec[];

export const PROMPT_SPECS = [
  {
    name: 'triage_incident',
    description: 'Triage a Haunting: read it, check evidence, decide the next step.',
    argsSchema: promptArgsSchemas.triage_incident,
  },
  {
    name: 'write_postmortem',
    description: 'Write the Autopsy for a closed Haunting.',
    argsSchema: promptArgsSchemas.write_postmortem,
  },
] as const satisfies readonly PromptSpec[];

export const RESOURCE_TEMPLATE_SPECS = [
  {
    uriTemplate: POSTMORTEM_URI_TEMPLATE,
    name: 'Autopsy',
    description: 'Postmortem for an incident.',
    mimeType: POSTMORTEM_MIME_TYPE,
  },
] as const satisfies readonly ResourceTemplateSpec[];

/** The whole primitive set the API serves. The drift check compares this with the API. */
export const GRAVESHIFT_MCP_CATALOG = {
  server: MCP_SERVER_INFO,
  tools: TOOL_SPECS,
  prompts: PROMPT_SPECS,
  resourceTemplates: RESOURCE_TEMPLATE_SPECS,
} as const;
