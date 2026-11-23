import { createInMemoryPublisher } from '@graveshift/events/testing';
import type { INestApplication } from '@nestjs/common';
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
import { TEST_CONFIG, testBootConfig } from '../fakes/auth-test-config';
import { FakeCredentialRepo } from '../fakes/fake-credential-repo';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

const SHA = 'a'.repeat(40);
const STARTED = '2026-11-22T07:00:00.000Z';

describe.skipIf(!dbTestEnabled)('v3 deployment HTTP with real stores', () => {
  let db: PrismaService;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    db = await openTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await db.organization.deleteMany();
  });

  afterAll(async () => db.onModuleDestroy());

  async function boot() {
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
      scopes: expandScopes(['project:write', 'project:read']),
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
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    const token = await moduleRef.get(JwtService).signAsync(
      { sub: 'real-client', projectId: '1001', scope: ['project:write', 'project:read'] },
      {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        algorithm: 'HS256',
        expiresIn: 3600,
      },
    );
    const runningApp = app;
    if (runningApp === undefined) throw new Error('Test application did not boot');
    return { org, token, close: () => runningApp.close() };
  }

  test('concurrent redeploys append one row and one audit entry', async () => {
    const { org, token, close } = await boot();
    const running = app;
    if (running === undefined) throw new Error('Test application did not boot');
    try {
      const route = `/api/organizations/${org.id}/projects/1001/deployments`;
      const responses = await Promise.all(
        [0, 1].map(() =>
          request(running.getHttpServer())
            .post(route)
            .set('authorization', `Bearer ${token}`)
            .send({
              deploymentId: SHA,
              title: 'ci-deploy',
              environment: 'production',
              dateStarted: STARTED,
            }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      expect(await db.deploy.count({ where: { projectId: '1001', deploymentId: SHA } })).toBe(1);
      expect(
        await db.auditEntry.count({ where: { projectId: '1001', type: 'deploy.created' } }),
      ).toBe(1);
      const stored = await db.deploy.findFirstOrThrow({ where: { deploymentId: SHA } });
      expect(stored.title).toBe('ci-deploy');
      expect(stored.deploymentId).toBe(SHA);
    } finally {
      await close();
    }
  });
});
