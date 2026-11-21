import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { McpExecutionContext } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

import { PRIMITIVE_SCOPES } from './mcp-http-scope.guard';

/** A presented token may call only the primitives its scopes allow. Deny by default. */
@Injectable()
export class McpScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const mcp = McpExecutionContext.create(context);
    const request = mcp.getRequest<{ authInfo?: AuthInfo } | undefined>();
    // The HTTP bearer guard populates request.authInfo before the call. stdio
    // and in-memory clients have no token and trust the local process.
    const auth = mcp.getAuthInfo() ?? request?.authInfo;
    if (!auth) return true;
    const name = mcp.getName();
    const required = name ? PRIMITIVE_SCOPES[name] : undefined;
    if (!required || !auth.scopes.includes(required)) throw new ForbiddenException();
    return true;
  }
}
