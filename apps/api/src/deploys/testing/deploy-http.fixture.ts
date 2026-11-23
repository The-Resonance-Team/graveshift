import 'reflect-metadata';

import { createInMemoryPublisher } from '@graveshift/events/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { FakeCredentialRepo } from '../../../test/fakes/fake-credential-repo';
import { TEST_CONFIG, testBootConfig } from '../../../test/fakes/auth-test-config';
import { configureApp } from '../../app.factory';
import { AppModule } from '../../app.module';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO, EVENT_PUBLISHER } from '../../auth/auth.types';
import { expandScopes } from '../../auth/scopes';
import { BOOT_CONFIG } from '../../config/boot.config';
import { IDENTITY_REPO } from '../../identity/identity.types';
import { FakeIdentityRepo } from '../../identity/testing/fake-identity.repo';
import { DeployRepo } from '../deploy.repo';
import { FakeDeployRepo } from './deploy-repo.fakes';

export interface DeployTestContext {
  app: INestApplication;
  identity: FakeIdentityRepo;
  jwt: JwtService;
  deploys: FakeDeployRepo;
  orgA: string;
  orgB: string;
  projectA: string;
  projectA2: string;
  projectB: string;
  clientA: string;
  clientA2: string;
  clientB: string;
  ciClient: string;
  orgCiClient: string;
}

/** Builds the real HTTP app with in-memory stores. No database or network is used. */
export async function buildDeployTestApp(): Promise<DeployTestContext> {
  const identity = new FakeIdentityRepo();
  const orgA = (await identity.addOrganization({ name: 'Alpha', slug: 'alpha' })).id;
  const orgB = (await identity.addOrganization({ name: 'Beta', slug: 'beta' })).id;
  const projectA = (
    await identity.addProject({ projectId: '1001', orgId: orgA, name: 'First', slug: 'first' })
  ).projectId;
  const projectA2 = (
    await identity.addProject({ projectId: '1002', orgId: orgA, name: 'Second', slug: 'second' })
  ).projectId;
  const projectB = (
    await identity.addProject({ projectId: '2001', orgId: orgB, name: 'Foreign', slug: 'foreign' })
  ).projectId;
  const clientA = 'deploy-client-a';
  const clientA2 = 'deploy-client-a2';
  const clientB = 'deploy-client-b';
  const ciClient = 'deploy-client-ci';
  const orgCiClient = 'deploy-client-org-ci';
  await identity.addOAuthClient({
    clientId: clientA,
    secretHash: 'test-hash-only',
    orgId: orgA,
    projectId: projectA,
    scopes: expandScopes(['org:read', 'project:read', 'project:write', 'org:ci']),
  });
  await identity.addOAuthClient({
    clientId: clientB,
    secretHash: 'test-hash-only',
    orgId: orgB,
    projectId: projectB,
    scopes: expandScopes(['org:read', 'project:read', 'project:write', 'org:ci']),
  });
  await identity.addOAuthClient({
    clientId: ciClient,
    secretHash: 'test-hash-only',
    orgId: orgA,
    projectId: projectA,
    scopes: expandScopes(['org:ci']),
  });
  await identity.addOAuthClient({
    clientId: clientA2,
    secretHash: 'test-hash-only',
    orgId: orgA,
    projectId: projectA2,
    scopes: expandScopes(['project:read']),
  });
  await identity.addOAuthClient({
    clientId: orgCiClient,
    secretHash: 'test-hash-only',
    orgId: orgA,
    projectId: projectA,
    scopes: expandScopes(['org:read', 'org:ci', 'project:read', 'project:write']),
  });

  const deploys = new FakeDeployRepo();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BOOT_CONFIG)
    .useValue(await testBootConfig())
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(TEST_CONFIG)
    .overrideProvider(CREDENTIAL_REPO)
    .useValue(new FakeCredentialRepo())
    .overrideProvider(EVENT_PUBLISHER)
    .useValue(createInMemoryPublisher())
    .overrideProvider(IDENTITY_REPO)
    .useValue(identity)
    .overrideProvider(DeployRepo)
    .useValue(deploys)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  return {
    app,
    identity,
    jwt: moduleRef.get(JwtService),
    deploys,
    orgA,
    orgB,
    projectA,
    projectA2,
    projectB,
    clientA,
    clientA2,
    clientB,
    ciClient,
    orgCiClient,
  };
}

export const http = (context: DeployTestContext) => request(context.app.getHttpServer());
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Signs a test-only OAuth client token with the test issuer and audience. */
export async function clientToken(
  context: DeployTestContext,
  clientId: string,
  projectId: string,
  scopes: string[],
): Promise<string> {
  return context.jwt.signAsync(
    { sub: clientId, projectId, scope: scopes },
    {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      algorithm: 'HS256',
      expiresIn: 3600,
    },
  );
}
