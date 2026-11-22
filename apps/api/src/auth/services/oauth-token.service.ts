import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../auth.types';

export const OAUTH_TOKEN_TTL_SECONDS = 300;

/** Runs the OAuth 2.1 client-credentials grant against the boot client registry. */
@Injectable()
export class OAuthTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
  ) {}

  async exchange(
    clientId: string,
    clientSecret: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const entry = Object.hasOwn(this.config.oauthClients, clientId)
      ? this.config.oauthClients[clientId]
      : undefined;
    if (!entry || !this.secretEquals(entry.secret, clientSecret)) {
      throw new UnauthorizedException();
    }
    const payload = {
      sub: clientId,
      projectId: entry.projectId,
      scope: [...entry.scopes],
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

  private secretEquals(expected: string, presented: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(presented);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
