import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../auth.types';
import { IDENTITY_REPO, type IdentityRepo } from '../../identity/identity.types';
import { expandScopes } from '../scopes';

export const OAUTH_TOKEN_TTL_SECONDS = 300;

/** Runs the OAuth 2.1 client-credentials grant against the stored client registry. */
@Injectable()
export class OAuthTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  async exchange(
    clientId: string,
    clientSecret: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const client = await this.identity.findOAuthClient(clientId);
    if (client === undefined || !this.secretEquals(client.secretHash, clientSecret)) {
      throw new UnauthorizedException();
    }
    const payload = {
      sub: clientId,
      projectId: client.projectId,
      scope: expandScopes(client.scopes),
      jti: randomUUID(),
    };
    const access_token = await this.jwt.signAsync(payload, {
      secret: this.config.jwtSecret,
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
      algorithm: 'HS256',
      expiresIn: OAUTH_TOKEN_TTL_SECONDS,
    });
    return { access_token, expires_in: OAUTH_TOKEN_TTL_SECONDS };
  }

  private secretEquals(expectedHex: string, presented: string): boolean {
    const actual = createHash('sha256').update(presented).digest('hex');
    const a = Buffer.from(expectedHex, 'utf8');
    const b = Buffer.from(actual, 'utf8');
    return a.length === b.length && a.length === 64 && timingSafeEqual(a, b);
  }
}
