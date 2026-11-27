import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

import { CredentialService } from '../auth/services/credential.service';
import type { VerifiedCredential } from '../auth/auth.types';
import { McpProjectContext } from './mcp-project-context';

function credentialAuthInfo(
  token: string,
  principal: VerifiedCredential,
): AuthInfo & { projectId: string } {
  return {
    token,
    clientId: principal.clientId,
    scopes: principal.scopes,
    ...(principal.expiresAt === null
      ? {}
      : { expiresAt: Math.floor(Date.parse(principal.expiresAt) / 1000) }),
    projectId: principal.projectId,
  };
}

/** MCP shares the one credential component. No second issuer lives in this module. */
@Injectable()
export class McpTokenVerifierService implements McpTokenVerifier {
  constructor(private readonly credentials: CredentialService) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const principal = await this.credentials.verify(token, 'mcp');
    return credentialAuthInfo(token, principal);
  }
}

/** Guards the HTTP endpoint with the same check; stdio has no authentication by design. */
@Injectable()
export class McpBearerGuard implements CanActivate {
  constructor(
    private readonly credentials: CredentialService,
    private readonly projectContext: McpProjectContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      mcpPrincipal?: { scopes: string[] };
      authInfo?: AuthInfo & { projectId?: string };
    }>();
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    try {
      const principal = await this.credentials.verify(token, 'mcp');
      request.mcpPrincipal = principal;
      request.authInfo = credentialAuthInfo(token, principal);
      this.projectContext.enter(principal.projectId);
      return true;
    } catch {
      const response = context
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>();
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw new UnauthorizedException('Bearer token required');
    }
  }
}
