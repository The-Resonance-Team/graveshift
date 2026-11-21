import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

import { CredentialService } from '../auth/services/credential.service';

/** MCP shares the one credential component. No second issuer lives in this module. */
@Injectable()
export class McpTokenVerifierService implements McpTokenVerifier {
  constructor(private readonly credentials: CredentialService) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const principal = await this.credentials.verify(token, 'mcp');
    return {
      token,
      clientId: principal.clientId,
      scopes: principal.scopes,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }
}

/** Guards the HTTP endpoint with the same check; stdio has no authentication by design. */
@Injectable()
export class McpBearerGuard implements CanActivate {
  constructor(private readonly credentials: CredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers?: { authorization?: string } }>();
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    try {
      await this.credentials.verify(token, 'mcp');
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
