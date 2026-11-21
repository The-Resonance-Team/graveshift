import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthInfo } from '@modelcontextprotocol/server';

export const MCP_READ_SCOPE_ORDER = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
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

interface McpCall {
  method?: string;
  params?: { name?: string; uri?: string };
}

interface McpHttpRequest {
  authInfo?: AuthInfo;
  body?: McpCall | McpCall[];
}

const PROTOCOL_METHODS = new Set(['initialize', 'ping', 'notifications/initialized']);

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
      const required = this.requiredScope(method, call, scopes);
      if (!required || !scopes.includes(required)) throw new ForbiddenException();
    }
    return true;
  }

  private requiredScope(method: string, call: McpCall, scopes: string[]): string | undefined {
    if (
      method === 'tools/list' ||
      method === 'prompts/list' ||
      method === 'resources/list' ||
      method === 'resources/templates/list'
    ) {
      return this.broadestReadScope(scopes);
    }
    if (method === 'tools/call' || method === 'prompts/get') {
      const name = call.params?.name;
      return name ? PRIMITIVE_SCOPES[name] : undefined;
    }
    if (method === 'resources/read') {
      const uri = call.params?.uri ?? '';
      return uri.startsWith('graveshift://incidents/') && uri.endsWith('/postmortem')
        ? 'incidents:read'
        : undefined;
    }
    return undefined;
  }

  private broadestReadScope(scopes: readonly string[]): string | undefined {
    return MCP_READ_SCOPE_ORDER.find((scope) => scopes.includes(scope));
  }
}
