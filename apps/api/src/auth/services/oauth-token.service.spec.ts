import { JwtService } from '@nestjs/jwt';
import { describe, expect, test } from 'bun:test';

import { TEST_CLIENT_SECRET, TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { OAUTH_TOKEN_TTL_SECONDS, OAuthTokenService } from './oauth-token.service';

describe('OAuthTokenService registry ownership', () => {
  test.each(['constructor', '__proto__', 'toString'])(
    'an inherited client name %s returns 401',
    async (clientId) => {
      const service = new OAuthTokenService(new JwtService(), TEST_CONFIG);
      await expect(service.exchange(clientId, TEST_CLIENT_SECRET)).rejects.toHaveProperty(
        'status',
        401,
      );
    },
  );

  test('an explicit own registry entry may use a prototype property name', async () => {
    const entry = { secret: TEST_CLIENT_SECRET, projectId: 'project-1', scopes: ['tokens:manage'] };
    const jwt = new JwtService();
    const config = {
      ...TEST_CONFIG,
      oauthClients: { ['constructor']: entry, ['__proto__']: entry },
    };
    const service = new OAuthTokenService(jwt, config);
    await Promise.all(
      ['constructor', '__proto__'].map(async (clientId) => {
        const issued = await service.exchange(clientId, TEST_CLIENT_SECRET);
        const payload = jwt.verify<{
          sub: string;
          projectId: string;
          scope: string[];
          iat: number;
          exp: number;
        }>(issued.access_token, {
          secret: config.jwtSecret,
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
          algorithms: ['HS256'],
        });
        expect(payload.sub).toBe(clientId);
        expect(payload.projectId).toBe(entry.projectId);
        expect(payload.scope).toEqual(entry.scopes);
        expect(payload.exp - payload.iat).toBe(OAUTH_TOKEN_TTL_SECONDS);
        expect(issued.expires_in).toBe(OAUTH_TOKEN_TTL_SECONDS);
      }),
    );
  });
});
