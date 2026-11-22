import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { CREDENTIAL_CONFIG, type AuthConfig, type Principal } from './auth.types';
import { verifyOAuthPrincipal, type OAuthPayload } from './oauth-principal';
import { CONFIG_EXPORT_SCOPE } from './scopes';

// The source guard sets this field from route metadata before passport runs.
export interface OAuthAccessRequest {
  oauthRequiredScope?: string | null | undefined;
}

/**
 * Validates an OAuth 2.1 client-credentials bearer token with the shared issuer check.
 * It does not require tokens:manage: credential management keeps its own strategy.
 * A route may declare its own required scope through metadata. A route with no metadata
 * keeps the config endpoint's exact scope check, so the config read stays protected.
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
      passReqToCallback: true,
    });
  }

  validate(request: OAuthAccessRequest, payload: OAuthPayload): Principal {
    const principal = verifyOAuthPrincipal(payload, this.config);
    // Undefined means no route metadata: keep the config endpoint's default check.
    const required =
      request.oauthRequiredScope === undefined ? CONFIG_EXPORT_SCOPE : request.oauthRequiredScope;
    if (required !== null && !principal.scopes.includes(required)) {
      throw new ForbiddenException();
    }
    return principal;
  }
}
