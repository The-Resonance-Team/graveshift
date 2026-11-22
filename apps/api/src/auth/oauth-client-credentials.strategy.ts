import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { CREDENTIAL_CONFIG, type AuthConfig, type Principal } from './auth.types';
import { MANAGEMENT_SCOPE } from './scopes';

interface OAuthPayload {
  sub?: string;
  projectId?: string;
  scope?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

/** Validates an OAuth 2.1 client-credentials bearer token signed with @nestjs/jwt. */
@Injectable()
export class OAuthClientCredentialsStrategy extends PassportStrategy(
  Strategy,
  'oauth-client-credentials',
) {
  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtSecret,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ['HS256'],
    });
  }

  validate(payload: OAuthPayload): Principal {
    const now = Math.floor(Date.now() / 1000);
    if (
      !payload?.sub ||
      !payload.projectId ||
      !Array.isArray(payload.scope) ||
      payload.iss !== this.config.jwtIssuer ||
      payload.aud !== this.config.jwtAudience ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now
    ) {
      throw new UnauthorizedException();
    }
    // The project and the scope grant come from the boot registry, not from token claims.
    const entry = this.config.oauthClients[payload.sub];
    if (!entry || entry.projectId !== payload.projectId) throw new UnauthorizedException();
    if (!payload.scope.includes(MANAGEMENT_SCOPE)) throw new UnauthorizedException();
    if (!payload.scope.every((scope) => entry.scopes.includes(scope))) {
      throw new UnauthorizedException();
    }
    return { clientId: payload.sub, projectId: payload.projectId, scopes: payload.scope };
  }
}
