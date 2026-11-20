import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

const MIN_TOKEN_LENGTH = 32;
const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Static bearer auth only. No OAuth resource URL or authorization server is advertised: neither exists here.
 * The HTTP route guard calls this check; stdio has no authentication by design.
 */
export function verifyMcpToken(token: string): AuthInfo {
  const expected = process.env.GRAVESHIFT_MCP_TOKEN ?? '';
  if (expected.length < MIN_TOKEN_LENGTH || !timingSafeEqual(digest(token), digest(expected))) {
    throw new UnauthorizedException();
  }
  return {
    token,
    clientId: 'graveshift',
    scopes: [],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

/** Verifies the one static bearer token configured for the API's MCP endpoint. */
@Injectable()
export class McpTokenVerifierService implements McpTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return verifyMcpToken(token);
  }
}

/** Guards the HTTP endpoint with the same check; the in-memory client does not run route guards. */
@Injectable()
export class McpBearerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    try {
      verifyMcpToken(token);
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
