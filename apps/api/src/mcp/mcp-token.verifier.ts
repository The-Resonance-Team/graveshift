import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

export const MCP_RESOURCE = process.env.MCP_RESOURCE ?? 'http://127.0.0.1:3000/mcp';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Verifies the one static bearer token configured for the API's MCP endpoint. */
@Injectable()
export class McpTokenVerifierService implements McpTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const expected = process.env.GRAVESHIFT_MCP_TOKEN ?? '';
    if (expected.length < 32 || !timingSafeEqual(digest(token), digest(expected))) {
      throw new UnauthorizedException();
    }
    return {
      token,
      clientId: 'graveshift',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      resource: new URL(MCP_RESOURCE),
    };
  }
}
