import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { CREDENTIAL_CONFIG, type AuthConfig, type Principal } from './auth.types';
import { verifyOAuthPrincipal, type OAuthPayload } from './oauth-principal';

/**
 * Validates a plain OAuth 2.1 client-credentials bearer token for HTTP routes that are
 * opened by an exact scope, such as the read-only config routes. It does not require
 * tokens:manage: ConfigScopeGuard enforces the scope each route declares.
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
    return verifyOAuthPrincipal(payload, this.config);
  }
}
