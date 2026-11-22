import { UnauthorizedException } from '@nestjs/common';

import type { IdentityRepo } from '../identity/identity.types';
import { expandScopes } from './scopes';
import type { AuthConfig, Principal } from './auth.types';

export interface OAuthPayload {
  sub?: string;
  projectId?: string;
  scope?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

// The signature is verified by passport. The numeric project and the scope grant
// come from the stored OAuth client, never from token claims or a boot value.
export async function verifyOAuthPrincipal(
  payload: OAuthPayload,
  config: AuthConfig,
  identity: IdentityRepo,
): Promise<Principal> {
  const now = Math.floor(Date.now() / 1000);
  if (
    !payload?.sub ||
    !payload.projectId ||
    !Array.isArray(payload.scope) ||
    payload.iss !== config.jwtIssuer ||
    payload.aud !== config.jwtAudience ||
    typeof payload.exp !== 'number' ||
    payload.exp <= now
  ) {
    throw new UnauthorizedException();
  }
  if (!/^\d{1,20}$/.test(payload.projectId)) throw new UnauthorizedException();
  const client = await identity.findOAuthClient(payload.sub);
  if (client === undefined || client.projectId !== payload.projectId) {
    throw new UnauthorizedException();
  }
  const granted = new Set(expandScopes(client.scopes));
  if (!payload.scope.every((scope) => granted.has(scope))) throw new UnauthorizedException();
  return {
    clientId: payload.sub,
    projectId: payload.projectId,
    scopes: expandScopes(payload.scope),
  };
}
