import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { CREDENTIAL_CONFIG, type AuthConfig, type Principal } from '../auth.types';
import { MANAGEMENT_SCOPE } from '../scopes';

interface OAuthPayload {
  sub?: string;
  tenantId?: string;
  scope?: string[];
}

/** Validates an OAuth 2.1 client-credentials bearer token signed with @nestjs/jwt. */
@Injectable()
export class OAuthClientCredentialsStrategy extends PassportStrategy(
  Strategy,
  'oauth-client-credentials',
) {
  constructor(@Inject(CREDENTIAL_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtSecret,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ['HS256'],
    });
  }

  validate(payload: OAuthPayload): Principal {
    if (
      !payload?.sub ||
      !payload.tenantId ||
      !Array.isArray(payload.scope) ||
      !payload.scope.includes(MANAGEMENT_SCOPE)
    ) {
      throw new UnauthorizedException();
    }
    return { clientId: payload.sub, tenantId: payload.tenantId, scopes: payload.scope };
  }
}
