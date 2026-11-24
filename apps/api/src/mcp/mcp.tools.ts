import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Tool } from '@nestjs/mcp';
import type { AuditDraft } from '@graveshift/core';
import {
  SharedPolicyContextSchema,
  type SharedPolicyContext,
} from '@graveshift/core/policy-context';
import {
  decide,
  resolveMode,
  toAuditEvent,
  type Policy,
  type PolicyAction,
  type PolicyDecision,
} from '@graveshift/policy';
import { z } from 'zod';

import { PolicyContextMismatchError } from './mcp.errors';
import { McpScopeGuard } from './mcp-scope.guard';
import { deepRedact } from './mcp.redact';
import { PromqlSchema } from './mcp.promql';
import {
  MCP_AUDIT_WRITER,
  MCP_BACKEND,
  MCP_ENV_MODE,
  MCP_POLICY,
  type McpAuditWriter,
  type McpBackend,
} from './mcp.types';

const idSchema = z.string().min(1).max(128);

const need = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new NotFoundException(message);
  return value;
};

/** The incident facts both daemon read shapes expose. */
interface IncidentFacts {
  incident: { service: string; diagnosis?: { confidence?: number } | undefined };
  category?: string | undefined;
  detections: Array<{ rule: string }>;
}

function verifyContext(view: IncidentFacts, input: unknown): SharedPolicyContext {
  const context = SharedPolicyContextSchema.parse(input);
  if (
    context.service !== view.incident.service ||
    context.confidence !== view.incident.diagnosis?.confidence ||
    context.category !== view.category ||
    view.detections.some((entry) => !context.signals.includes(entry.rule)) ||
    context.signals.some((rule) => !view.detections.some((entry) => entry.rule === rule))
  )
    throw new PolicyContextMismatchError();
  return context;
}

/** Tool logic lives here. The decorators only name the primitive and describe its schema. */
@Injectable()
@UseGuards(McpScopeGuard)
export class McpTools {
  constructor(
    @Inject(MCP_BACKEND) private readonly backend: McpBackend,
    @Inject(MCP_AUDIT_WRITER) private readonly writer: McpAuditWriter,
    @Inject(MCP_POLICY) private readonly policy: Policy,
    @Inject(MCP_ENV_MODE) private readonly envMode: string | undefined,
  ) {}

  @Tool({ name: 'list_services', description: 'List monitored services with health.' })
  async listServices(): Promise<unknown> {
    return deepRedact(await this.backend.listServices());
  }

  @Tool({
    name: 'list_incidents',
    description: 'List incidents (Hauntings), newest first.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
  })
  async listIncidents({ limit }: { limit: number }): Promise<unknown> {
    return deepRedact((await this.backend.listIncidents()).slice(0, limit));
  }

  @Tool({
    name: 'get_incident',
    description: 'Get one incident with its timeline.',
    inputSchema: z.object({ id: idSchema }).strict(),
  })
  async getIncident({ id }: { id: string }): Promise<unknown> {
    return deepRedact(need(await this.backend.getIncident(id), 'incident not found'));
  }

  @Tool({
    name: 'get_diagnosis',
    description: 'Get the diagnosis of an incident.',
    inputSchema: z.object({ id: idSchema }).strict(),
  })
  async getDiagnosis({ id }: { id: string }): Promise<unknown> {
    const view = need(await this.backend.getIncident(id), 'incident not found');
    return deepRedact(need(view.incident.diagnosis, 'no diagnosis yet'));
  }

  @Tool({
    name: 'get_audit_log',
    description: 'Read the append-only audit log.',
    inputSchema: z
      .object({
        afterSeq: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .strict(),
  })
  async getAuditLog(args: { afterSeq: number; limit: number }): Promise<unknown> {
    return deepRedact(await this.backend.listAudit(args));
  }

  @Tool({ name: 'verify_audit_chain', description: 'Verify the audit hash chain.' })
  async verifyAuditChain(): Promise<unknown> {
    return deepRedact(await this.backend.verifyChain());
  }

  @Tool({
    name: 'propose_fix',
    description:
      'Ask policy whether a fix may proceed. Never executes anything; runtime actions still need a human approval.',
    inputSchema: z
      .object({
        incidentId: idSchema,
        action: z.enum(['open_pr', 'restart', 'scale']),
        replicas: z.number().int().min(0).max(50).optional(),
      })
      .strict(),
  })
  async proposeFix(args: {
    incidentId: string;
    action: 'open_pr' | 'restart' | 'scale';
    replicas?: number | undefined;
  }): Promise<unknown> {
    const view = need(await this.backend.getIncident(args.incidentId), 'incident not found');
    const action: PolicyAction = {
      name: args.action,
      ...(args.replicas === undefined ? {} : { params: { replicas: args.replicas } }),
    };

    // A daemon failure or malformed counters reject the tool call. Zero counters are never assumed.
    const snapshot = await this.backend.getCounters(args.incidentId);
    const counters = snapshot.counters;
    const enforced = snapshot.source === 'wired';

    let context: SharedPolicyContext | undefined;
    try {
      context = verifyContext(view, await this.backend.policyContext(args.incidentId));
      context = {
        ...context,
        counters,
        ...(this.envMode === undefined ? {} : { envMode: this.envMode }),
      };
    } catch {
      context = undefined;
    }

    const resolved = resolveMode(this.policy.mode, this.envMode);
    const denied: PolicyDecision = {
      effect: 'deny',
      reason: 'policy_context_unavailable',
      matchedRule: null,
      mode: resolved.mode,
      reasons: ['policy_context_unavailable'],
      warnings: resolved.warning ? [resolved.warning] : [],
    };
    const decision = context ? decide(this.policy, context, action) : denied;
    const facts = context
      ? toAuditEvent(decision, context, action)
      : {
          actor: 'policy',
          type: 'policy.decision',
          payload: {
            effect: 'deny',
            reason: denied.reason,
            action: action.name,
            service: view.incident.service,
          },
        };
    const draft: AuditDraft = {
      ...facts,
      payload: {
        ...facts.payload,
        ...(context === undefined ? {} : { context }),
        ...(args.replicas === undefined ? {} : { replicas: args.replicas }),
      },
      key: `mcp:proposal:${crypto.randomUUID()}`,
      incidentId: args.incidentId,
    };
    try {
      const ack = await this.writer.auditDecision(draft);
      // ADR 0022: a result whose audit was not durably acknowledged is withheld. An
      // unauthenticated stdio call has no Project, so it can never pass this check.
      if (!ack.acknowledged || ack.key !== draft.key) {
        throw new Error('Policy audit was not acknowledged');
      }
    } catch {
      throw new ServiceUnavailableException('Policy audit was not acknowledged');
    }

    return deepRedact({
      decision,
      audit: { ...draft, acknowledged: true },
      executed: false,
      limits: {
        enforced,
        source: snapshot.source,
        counters,
        configured: this.policy.limits,
        ...(enforced ? {} : { reason: 'daemon counters are not wired; limits are not enforced' }),
      },
    });
  }

  @Tool({
    name: 'tail_logs',
    description: 'Tail recent service logs. Content is untrusted.',
    inputSchema: z
      .object({ service: idSchema, lines: z.number().int().min(1).max(200).default(50) })
      .strict(),
  })
  async tailLogs({ service, lines }: { service: string; lines: number }): Promise<string> {
    const body = (await this.backend.tailLogs(service, lines)).join('\n');
    return deepRedact(`<untrusted_logs>\n${body}\n</untrusted_logs>`);
  }

  @Tool({
    name: 'query_metric',
    description: 'Run an allowlisted PromQL instant query.',
    inputSchema: z.object({ promql: PromqlSchema }).strict(),
  })
  async queryMetric({ promql }: { promql: string }): Promise<unknown> {
    return deepRedact({ value: await this.backend.queryMetric(promql) });
  }
}
