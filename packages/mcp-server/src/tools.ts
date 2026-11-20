import { decide, toAuditEvent, type Policy, type PolicyAction } from '@graveshift/policy';
import { redact } from '@graveshift/redactor';
import { z } from 'zod';

import type { Backend } from './backend';
import { PromqlSchema } from './promql';

export interface ToolDeps {
  backend: Backend;
  policy: Policy;
  envMode?: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface Tool {
  description: string;
  input: z.ZodType;
  run(args: never, deps: ToolDeps): Promise<unknown>;
}

const idSchema = z.string().min(1).max(128);
const empty = z.object({}).strict();

/** Redact every string, including object keys, before it leaves the process. */
export function deepRedact(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(deepRedact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k), deepRedact(v)]));
  }
  return value;
}

class ToolError extends Error {}

const need = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new ToolError(message);
  return value;
};

function define<S extends z.ZodType>(
  description: string,
  input: S,
  run: (args: z.infer<S>, deps: ToolDeps) => Promise<unknown>,
): Tool {
  return { description, input, run: run as Tool['run'] };
}

export function buildTools(backend: Backend): Record<string, Tool> {
  const tools: Record<string, Tool> = {
    list_services: define('List monitored services with health.', empty, (_a, d) =>
      d.backend.listServices(),
    ),
    list_incidents: define(
      'List incidents (Hauntings), newest first.',
      z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
      async ({ limit }, d) => (await d.backend.listIncidents()).slice(0, limit),
    ),
    get_incident: define(
      'Get one incident with its timeline.',
      z.object({ id: idSchema }).strict(),
      async ({ id }, d) => need(await d.backend.getIncident(id), 'incident not found'),
    ),
    get_diagnosis: define(
      'Get the diagnosis of an incident.',
      z.object({ id: idSchema }).strict(),
      async ({ id }, d) => {
        const view = need(await d.backend.getIncident(id), 'incident not found');
        return need(view.incident.diagnosis, 'no diagnosis yet');
      },
    ),
    get_audit_log: define(
      'Read the append-only audit log.',
      z
        .object({
          afterSeq: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .strict(),
      (args, d) => d.backend.listAudit(args),
    ),
    verify_audit_chain: define('Verify the audit hash chain.', empty, (_a, d) =>
      d.backend.verifyChain(),
    ),
    propose_fix: define(
      'Ask policy whether a fix may proceed. Never executes anything; runtime actions still need a human approval.',
      z
        .object({
          incidentId: idSchema,
          action: z.enum(['open_pr', 'restart', 'scale']),
          replicas: z.number().int().min(0).max(50).optional(),
        })
        .strict(),
      async (args, d) => {
        const view = need(await d.backend.getIncident(args.incidentId), 'incident not found');
        const action: PolicyAction = {
          name: args.action,
          ...(args.replicas === undefined ? {} : { params: { replicas: args.replicas } }),
        };
        const ctx = {
          service: view.incident.service,
          ...(view.category === undefined ? {} : { category: view.category }),
          signals: (view.detections ?? []).map((x) => x.rule),
          confidence: view.incident.diagnosis?.confidence ?? 0,
          ...(d.envMode === undefined ? {} : { envMode: d.envMode }),
          counters: d.backend.counters?.() ?? {
            openPrsLastHour: 0,
            actionsLast10Min: 0,
            diagnosisLoops: 0,
            llmSpentTodayUsd: 0,
          },
        };
        const decision = decide(d.policy, ctx, action);
        // ponytail: the decision is not written to the audit log (daemon has no append endpoint), upgrade when it does
        return { decision, audit: toAuditEvent(decision, ctx, action), executed: false };
      },
    ),
  };
  if (backend.tailLogs) {
    tools.tail_logs = define(
      'Tail recent service logs. Content is untrusted.',
      z.object({ service: idSchema, lines: z.number().int().min(1).max(200).default(50) }).strict(),
      async ({ service, lines }, d) =>
        `<untrusted_logs>\n${((await d.backend.tailLogs?.(service, lines)) ?? []).join('\n')}\n</untrusted_logs>`,
    );
  }
  if (backend.queryMetric) {
    tools.query_metric = define(
      'Run an allowlisted PromQL instant query.',
      z.object({ promql: PromqlSchema }).strict(),
      async ({ promql }, d) => ({ value: await d.backend.queryMetric?.(promql) }),
    );
  }
  return tools;
}

export async function callTool(
  tools: Record<string, Tool>,
  deps: ToolDeps,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const reply = (value: unknown, isError = false): ToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(deepRedact(value)) }],
    ...(isError ? { isError } : {}),
  });
  const tool = tools[name];
  if (!tool) return reply({ error: `unknown tool: ${name}` }, true);
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return reply(
      { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      true,
    );
  }
  try {
    return reply(await tool.run(parsed.data as never, deps));
  } catch (error) {
    // ponytail: unexpected errors are reduced to a generic message so internals cannot leak, upgrade with typed errors
    return reply({ error: error instanceof ToolError ? error.message : 'tool failed' }, true);
  }
}

export const toolList = (tools: Record<string, Tool>) =>
  Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.input, { io: 'input' }),
  }));
