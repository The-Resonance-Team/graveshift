import { UnauthorizedException } from '@nestjs/common';

import type { AuthConfig, Principal } from './auth.types';

export interface OAuthPayload {
  sub?: string;
  projectId?: string;
  scope?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

// One bearer check shared by every OAuth client-credentials strategy: the signature is
// verified by passport, and the project plus the scope grant come from the boot
// registry, never from token claims. A route adds its own scope requirement on top.
export function verifyOAuthPrincipal(payload: OAuthPayload, config: AuthConfig): Principal {
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
  const entry = config.oauthClients[payload.sub];
  if (!entry || entry.projectId !== payload.projectId) throw new UnauthorizedException();
  if (!payload.scope.every((scope) => entry.scopes.includes(scope))) {
    throw new UnauthorizedException();
  }
  return { clientId: payload.sub, projectId: payload.projectId, scopes: payload.scope };
}
