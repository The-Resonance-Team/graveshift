import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { CREDENTIAL_CONFIG, type AuthConfig, type Principal } from './auth.types';
import { verifyOAuthPrincipal, type OAuthPayload } from './oauth-principal';
import { CONFIG_EXPORT_SCOPE } from './scopes';

/**
 * Validates the OAuth 2.1 client-credentials bearer token for the one config endpoint.
 * It requires the exact scope of that endpoint before a handler reads any config value.
 * It does not require tokens:manage: credential management keeps its own strategy.
 */
@Injectable()
export class OAuthClientAccessStrategy extends PassportStrategy(Strategy, 'oauth-client-access') {
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
    const principal = verifyOAuthPrincipal(payload, this.config);
    if (!principal.scopes.includes(CONFIG_EXPORT_SCOPE)) throw new ForbiddenException();
    return principal;
  }
}
