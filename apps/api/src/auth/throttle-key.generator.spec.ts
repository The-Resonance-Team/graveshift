import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, test } from 'bun:test';

import {
  TEST_CLIENT_SECRET,
  TEST_CONFIG,
  testOAuthClients,
} from '../../test/fakes/auth-test-config';
import { FakeCredentialRepo } from '../../test/fakes/fake-credential-repo';
import { FakeIdentityRepo } from '../identity/testing/fake-identity.repo';
import type { Principal } from './auth.types';
import { CredentialService } from './services/credential.service';
import { OAuthTokenService } from './services/oauth-token.service';
import { ThrottleKeyGenerator, type ThrottleRequest } from './throttle-key.generator';

const principal: Principal = {
  clientId: 'client-1',
  projectId: '12345',
  scopes: ['tokens:manage', 'events:publish'],
};
const bucket = JSON.stringify(['client', '12345', 'client-1']);
const bearer = (token: string): ThrottleRequest => ({
  headers: { authorization: `Bearer ${token}` },
  ip: '127.0.0.2',
});

function setup() {
  const repo = new FakeCredentialRepo();
  const identity = new FakeIdentityRepo();
  for (const client of testOAuthClients()) void identity.clients.set(client.clientId, client);
  const credentials = new CredentialService(repo, TEST_CONFIG);
  const jwt = new JwtService();
  const generator = new ThrottleKeyGenerator(jwt, credentials, TEST_CONFIG, identity);
  return { repo, identity, jwt, credentials, generator };
}

describe('ThrottleKeyGenerator', () => {
  test('a cold process and a warm process resolve the same active Credential bucket', async () => {
    const { repo, identity, credentials, jwt, generator } = setup();
    const issued = await credentials.issue(
      { kind: 'plugin', name: 'publisher', scopes: ['events:publish'] },
      principal,
    );
    const restarted = new ThrottleKeyGenerator(
      jwt,
      new CredentialService(repo, TEST_CONFIG),
      TEST_CONFIG,
      identity,
    );
    const request = bearer(issued.value);
    expect(await restarted.track(request)).toBe(bucket);
    expect(await generator.track(bearer(issued.value))).toBe(bucket);
    expect(request.credentialPrincipal?.expiresAt).toBe(issued.expiresAt);
    const oauth = await new OAuthTokenService(jwt, TEST_CONFIG, identity).exchange(
      'client-1',
      TEST_CLIENT_SECRET,
    );
    expect(await generator.track(bearer(oauth.access_token))).toBe(bucket);
  });

  test('rotating unknown values, revoked values and expired values share the caller IP bucket', async () => {
    const { repo, credentials, generator } = setup();
    const revoked = await credentials.issue(
      { kind: 'plugin', name: 'revoked', scopes: ['events:publish'] },
      principal,
    );
    const expired = await credentials.issue(
      { kind: 'plugin', name: 'expired', scopes: ['events:publish'] },
      principal,
    );
    await generator.track(bearer(revoked.value));
    await credentials.revoke(revoked.id, principal);
    const record = repo.records.find((item) => item.id === expired.id);
    if (!record) throw new Error('Missing fixture');
    record.expiresAt = '2020-01-01T00:00:00.000Z';
    const values = [revoked.value, expired.value, 'x'.repeat(43), 'y'.repeat(43), 'short'];
    expect(await Promise.all(values.map((value) => generator.track(bearer(value))))).toEqual(
      values.map(() => 'ip:127.0.0.2'),
    );
  });

  test('keys are scoped to the route so public events and credentials use separate buckets', () => {
    const { generator } = setup();
    const context = (controller: string, handler: string) =>
      ({
        getClass: () => ({ name: controller }),
        getHandler: () => ({ name: handler }),
      }) as unknown as ExecutionContext;
    const events = context('EventsController', 'ingest');
    const credentials = context('CredentialsController', 'create');
    expect(generator.generate(events, 'ip:1.2.3.4')).toBe(generator.generate(events, 'ip:1.2.3.4'));
    expect(generator.generate(events, 'ip:1.2.3.4')).not.toBe(
      generator.generate(credentials, 'ip:1.2.3.4'),
    );
  });

  test.each([
    { sub: 'unregistered', projectId: '12345', scope: ['tokens:manage'] },
    { sub: 'constructor', projectId: '12345', scope: ['tokens:manage'] },
    { sub: '__proto__', projectId: '12345', scope: ['tokens:manage'] },
    { sub: 'client-1', projectId: 'forged', scope: ['tokens:manage'] },
    { sub: 'client-2', projectId: 'forged', scope: ['tokens:manage', 'events:publish'] },
    { sub: 'client-1', projectId: '12345', scope: ['events:publish'] },
    { sub: ['client-1'], projectId: '12345', scope: ['tokens:manage'] },
    { sub: 'client-1', projectId: ['12345'], scope: ['tokens:manage'] },
  ])('untrusted JWT claims cannot choose a client bucket: %j', async (payload) => {
    const { jwt, generator } = setup();
    const token = jwt.sign(payload, {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      expiresIn: 300,
    });
    expect(await generator.track(bearer(token))).toBe('ip:127.0.0.2');
  });
});
