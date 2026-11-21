import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PRIMITIVE_SCOPES } from './mcp-scope.guard';

interface McpHttpRequest {
  mcpPrincipal?: { scopes: string[] };
  body?:
    | { method?: string; params?: { name?: string } }
    | Array<{ method?: string; params?: { name?: string } }>;
}

/** Enforces the scope floor at the HTTP layer so a refusal is a real 403. */
@Injectable()
export class McpHttpScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<McpHttpRequest>();
    const body = request.body;
    const calls = Array.isArray(body) ? body : body ? [body] : [];
    for (const call of calls) {
      if (call.method !== 'tools/call') continue;
      const name = call.params?.name;
      const required = name ? PRIMITIVE_SCOPES[name] : undefined;
      const scopes = request.mcpPrincipal?.scopes ?? [];
      if (!required || !scopes.includes(required)) throw new ForbiddenException();
    }
    return true;
  }
}
