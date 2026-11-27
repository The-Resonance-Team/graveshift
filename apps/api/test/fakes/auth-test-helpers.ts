import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { EventEnvelope } from '@graveshift/core';
import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';

import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import { AUDIT_READER, AUDIT_SINK } from '../../src/audit/audit.sink';
import { DeployRepo } from '../../src/deploys/deploy.repo';
import {
  CREDENTIAL_CONFIG,
  CREDENTIAL_REPO,
  EVENT_PUBLISHER,
  SENTRY_CREDENTIAL_VERIFIER,
  type AuthConfig,
  type CredentialVerifier,
} from '../../src/auth/auth.types';
import { BOOT_CONFIG } from '../../src/config/boot.config';
import { IDENTITY_REPO } from '../../src/identity/identity.types';
import type { PrismaService } from '../../src/infra/prisma.service';
import type { AuthFixture } from '../database/auth.fixture';
import { TEST_CONFIG, testBootConfig } from './auth-test-config';

export interface AuthTestApp {
  app: INestApplication;
  jwt: JwtService;
  repo: AuthFixture['repo'];
  identity: AuthFixture['identity'];
  publisher: InMemoryPublisher;
  audit: AuthFixture['audit'];
  deploys: AuthFixture['deploys'];
  db: PrismaService;
}

/** Boots the full API over the guarded database fixture, with real repository seams. */
export async function buildAuthApp(
  fixture: AuthFixture,
  overrides: Partial<AuthConfig> = {},
  publisherOverride?: InMemoryPublisher,
  sentryVerifier?: CredentialVerifier,
): Promise<AuthTestApp> {
  const { db, repo, identity, audit, deploys } = fixture;
  const publisher = publisherOverride ?? createInMemoryPublisher();
  const config = { ...TEST_CONFIG, ...overrides };
  const boot = { ...(await testBootConfig()), auth: config };
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BOOT_CONFIG)
    .useValue(boot)
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(config)
    .overrideProvider(CREDENTIAL_REPO)
    .useValue(repo)
    .overrideProvider(IDENTITY_REPO)
    .useValue(identity)
    .overrideProvider(AUDIT_SINK)
    .useValue(audit)
    .overrideProvider(AUDIT_READER)
    .useValue(audit)
    .overrideProvider(DeployRepo)
    .useValue(deploys)
    .overrideProvider(EVENT_PUBLISHER)
    .useValue(publisher);
  if (sentryVerifier) {
    builder.overrideProvider(SENTRY_CREDENTIAL_VERIFIER).useValue(sentryVerifier);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, jwt: moduleRef.get(JwtService), repo, identity, publisher, audit, deploys, db };
}

export function accessToken(
  jwt: JwtService,
  scopes: string[],
  overrides: { clientId?: string; projectId?: string } = {},
): string {
  return jwt.sign(
    {
      sub: overrides.clientId ?? 'client-1',
      projectId: overrides.projectId ?? '12345',
      scope: scopes,
      jti: 'test-jti',
    },
    {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      expiresIn: '5m',
    },
  );
}

export interface RawTokenOptions {
  secret?: string;
  issuer?: string;
  audience?: string;
  noExp?: boolean;
  expired?: boolean;
  projectId?: string;
  scope?: string[];
  sub?: string;
}

/** Mints a token with explicit claims for negative OAuth tests. */
export function rawToken(jwt: JwtService, options: RawTokenOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: options.sub ?? 'client-1',
      projectId: options.projectId ?? '12345',
      scope: options.scope ?? ['tokens:manage'],
      jti: 'raw-jti',
      ...(options.noExp ? {} : { exp: options.expired ? now - 60 : now + 300 }),
    },
    {
      secret: options.secret ?? TEST_CONFIG.jwtSecret,
      issuer: options.issuer ?? TEST_CONFIG.jwtIssuer,
      audience: options.audience ?? TEST_CONFIG.jwtAudience,
    },
  );
}

export function validEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: 'evt-1',
    projectId: '12345',
    source: 'native',
    service: 'api',
    type: 'signal.oom',
    severity: 'info',
    observedAt: '2026-11-20T10:00:00.000Z',
    traceId: 'trace-1',
    fingerprint: 'api:oom',
    payload: { restarts: 3 },
    ...overrides,
  };
}
