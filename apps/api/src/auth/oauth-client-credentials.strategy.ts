import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';
import { CREDENTIAL_CONFIG, type AuthConfig, type Principal } from './auth.types';
import { MANAGEMENT_SCOPE } from './scopes';
import { verifyOAuthPrincipal, type OAuthPayload } from './oauth-principal';

/** Validates an OAuth 2.1 client-credentials bearer token signed with @nestjs/jwt. */
@Injectable()
export class OAuthClientCredentialsStrategy extends PassportStrategy(
  Strategy,
  'oauth-client-credentials',
) {
  constructor(
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtSecret,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: OAuthPayload): Promise<Principal> {
    const principal = await verifyOAuthPrincipal(payload, this.config, this.identity);
    // The credential-management surface stays gated on tokens:manage.
    if (!principal.scopes.includes(MANAGEMENT_SCOPE)) throw new UnauthorizedException();
    return principal;
  }
}
