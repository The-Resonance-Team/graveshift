import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthInfo } from '@modelcontextprotocol/server';

import { canCallMcpMethod } from './mcp.permissions';

export const MCP_READ_SCOPE_ORDER = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
  'fix:propose',
] as const;

/** Keys are exact registered primitive names in snake_case. A wrong name is denied with 403. */
export const PRIMITIVE_SCOPES: Record<string, string> = {
  list_services: 'incidents:read',
  list_incidents: 'incidents:read',
  get_incident: 'incidents:read',
  triage_incident: 'incidents:read',
  write_postmortem: 'incidents:read',
  postmortem: 'incidents:read',
  get_diagnosis: 'diagnoses:read',
  get_audit_log: 'audit:read',
  verify_audit_chain: 'audit:read',
  tail_logs: 'logs:read',
  query_metric: 'metrics:read',
  propose_fix: 'fix:propose',
};

const PROTOCOL_METHODS = new Set(['initialize', 'ping', 'server/discover']);
const DISCOVERY_METHODS = new Set([
  'tools/list',
  'prompts/list',
  'resources/list',
  'resources/templates/list',
]);

interface McpCall {
  method?: string;
  params?: { name?: string; uri?: string };
}

interface McpHttpRequest {
  authInfo?: AuthInfo & { projectId?: string };
  body?: McpCall | McpCall[];
}

/** Checks every MCP request method at the HTTP layer, so a refusal is a real 403. */
@Injectable()
export class McpHttpScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<McpHttpRequest>();
    const auth = request.authInfo;
    if (!auth || !Array.isArray(auth.scopes)) throw new ForbiddenException();
    const scopes = auth.scopes;
    const body = request.body;
    const calls = Array.isArray(body) ? body : body ? [body] : [];
    if (calls.length === 0) throw new ForbiddenException();

    for (const call of calls) {
      const method = call.method ?? '';
      if (method.startsWith('notifications/') || PROTOCOL_METHODS.has(method)) continue;
      if (DISCOVERY_METHODS.has(method)) {
        if (!MCP_READ_SCOPE_ORDER.some((scope) => scopes.includes(scope))) {
          throw new ForbiddenException();
        }
        continue;
      }
      // The Events list scope is bound to the authenticated project.
      if (method === 'events/list' && !auth.projectId) throw new ForbiddenException();
      if (!canCallMcpMethod(call, scopes)) throw new ForbiddenException();
    }
    return true;
  }
}
