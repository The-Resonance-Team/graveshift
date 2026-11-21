import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { McpExecutionContext } from '@nestjs/mcp';

// Temporary floor until ticket #47 owns the full MCP scope mapping.
export const PRIMITIVE_SCOPES: Record<string, string> = {
  list_services: 'incidents:read',
  list_incidents: 'incidents:read',
  get_incident: 'incidents:read',
  'triage-incident': 'incidents:read',
  postmortem: 'incidents:read',
  'write-postmortem': 'incidents:read',
  get_diagnosis: 'diagnoses:read',
  get_audit_log: 'audit:read',
  verify_audit_chain: 'audit:read',
  tail_logs: 'logs:read',
  query_metric: 'metrics:read',
  propose_fix: 'fix:propose',
};

/** A presented token may call only the primitives its scopes allow. Deny by default. */
@Injectable()
export class McpScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const mcp = McpExecutionContext.create(context);
    const auth = mcp.getAuthInfo();
    // stdio and in-memory clients have no token and trust the local process.
    if (!auth) return true;
    const required = mcp.getName() ? PRIMITIVE_SCOPES[mcp.getName() as string] : undefined;
    if (!required || !auth.scopes.includes(required)) throw new ForbiddenException();
    return true;
  }
}
