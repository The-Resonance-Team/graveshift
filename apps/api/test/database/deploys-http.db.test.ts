import { createInMemoryPublisher } from '@graveshift/events/testing';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { CREDENTIAL_CONFIG, CREDENTIAL_REPO, EVENT_PUBLISHER } from '../../src/auth/auth.types';
import { expandScopes } from '../../src/auth/scopes';
import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import { BOOT_CONFIG } from '../../src/config/boot.config';
import { IDENTITY_REPO } from '../../src/identity/identity.types';
import { FakeIdentityRepo } from '../../src/identity/testing/fake-identity.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { ReleaseRepo } from '../../src/releases/release.repo';
import { TEST_CONFIG, testBootConfig } from '../fakes/auth-test-config';
import { FakeCredentialRepo } from '../fakes/fake-credential-repo';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

describe.skipIf(!dbTestEnabled)('v3 release HTTP conflict with real stores', () => {
  let db: PrismaService;

  beforeAll(async () => {
    db = await openTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await db.organization.deleteMany();
  });

  afterAll(async () => db.onModuleDestroy());

  test('a concurrent duplicate Release version returns 409 over HTTP', async () => {
    const org = await db.organization.create({ data: { name: 'Alpha', slug: 'alpha' } });
    await db.project.create({
      data: { projectId: '1001', orgId: org.id, name: 'First', slug: 'first' },
    });
    const identity = new FakeIdentityRepo();
    identity.organizations.set(org.id, {
      id: org.id,
      name: 'Alpha',
      slug: 'alpha',
      createdAt: new Date().toISOString(),
    });
    await identity.addProject({ projectId: '1001', orgId: org.id, name: 'First', slug: 'first' });
    await identity.addOAuthClient({
      clientId: 'real-client',
      secretHash: 'test-hash-only',
      orgId: org.id,
      projectId: '1001',
      scopes: expandScopes(['project:write']),
    });
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
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    try {
      const token = await moduleRef.get(JwtService).signAsync(
        { sub: 'real-client', projectId: '1001', scope: ['project:write'] },
        {
          secret: TEST_CONFIG.jwtSecret,
          issuer: TEST_CONFIG.jwtIssuer,
          audience: TEST_CONFIG.jwtAudience,
          algorithm: 'HS256',
          expiresIn: 3600,
        },
      );
      // Bypass the service pre-check so the 409 must come from the Prisma
      // P2002 catch on the real repository.
      const releases = moduleRef.get(ReleaseRepo);
      releases.findByVersion = async () => undefined;
      const responses = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post(`/api/organizations/${org.id}/releases`)
            .set('authorization', `Bearer ${token}`)
            .send({ version: 'v3.3.0', projects: ['1001'] }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await db.release.count({ where: { orgId: org.id, version: 'v3.3.0' } })).toBe(1);
    } finally {
      await app.close();
    }
  });
});
