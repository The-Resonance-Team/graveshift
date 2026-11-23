import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, test } from 'bun:test';

import {
  TEST_CLIENT_SECRET,
  TEST_CONFIG,
  testOAuthClients,
} from '../../../test/fakes/auth-test-config';
import { FakeIdentityRepo } from '../../identity/testing/fake-identity.repo';
import { OAUTH_TOKEN_TTL_SECONDS, OAuthTokenService } from './oauth-token.service';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function setup() {
  const identity = new FakeIdentityRepo();
  for (const client of testOAuthClients()) void identity.clients.set(client.clientId, client);
  const jwt = new JwtService();
  return { identity, jwt, service: new OAuthTokenService(jwt, TEST_CONFIG, identity) };
}

describe('OAuthTokenService registry ownership', () => {
  test.each(['constructor', '__proto__', 'toString'])(
    'an inherited client name %s returns 401',
    async (clientId) => {
      const { service } = setup();
      await expect(service.exchange(clientId, TEST_CLIENT_SECRET)).rejects.toHaveProperty(
        'status',
        401,
      );
    },
  );

  test('a stored registry entry may use a prototype property name', async () => {
    const { identity, jwt, service } = setup();
    const projectId = '12345';
    const scopes = ['tokens:manage'];
    for (const clientId of ['constructor', '__proto__']) {
      void identity.clients.set(clientId, {
        clientId,
        secretHash: digest(TEST_CLIENT_SECRET),
        orgId: 'test-org',
        projectId,
        scopes,
      });
    }
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
          secret: TEST_CONFIG.jwtSecret,
          issuer: TEST_CONFIG.jwtIssuer,
          audience: TEST_CONFIG.jwtAudience,
          algorithms: ['HS256'],
        });
        expect(payload.sub).toBe(clientId);
        expect(payload.projectId).toBe(projectId);
        expect(payload.scope).toEqual(scopes);
        expect(payload.exp - payload.iat).toBe(OAUTH_TOKEN_TTL_SECONDS);
        expect(issued.expires_in).toBe(OAUTH_TOKEN_TTL_SECONDS);
      }),
    );
  });
});
