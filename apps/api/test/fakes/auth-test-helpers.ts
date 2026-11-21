import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { EventEnvelope } from '@graveshift/core';
import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';

import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import {
  CREDENTIAL_CONFIG,
  CREDENTIAL_REPO,
  EVENT_PUBLISHER,
  type AuthConfig,
} from '../../src/auth/auth.types';
import { TEST_CONFIG } from './auth-test-config';
import { FakeCredentialRepo } from './fake-credential-repo';

export { TEST_CONFIG };

export interface AuthTestApp {
  app: INestApplication;
  jwt: JwtService;
  repo: FakeCredentialRepo;
  publisher: InMemoryPublisher;
}

export async function buildAuthApp(overrides: Partial<AuthConfig> = {}): Promise<AuthTestApp> {
  const repo = new FakeCredentialRepo();
  const publisher = createInMemoryPublisher();
  const config = { ...TEST_CONFIG, ...overrides };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(config)
    .overrideProvider(CREDENTIAL_REPO)
    .useValue(repo)
    .overrideProvider(EVENT_PUBLISHER)
    .useValue(publisher)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, jwt: moduleRef.get(JwtService), repo, publisher };
}

export function accessToken(
  jwt: JwtService,
  scopes: string[],
  overrides: { clientId?: string; tenantId?: string } = {},
): string {
  return jwt.sign(
    {
      sub: overrides.clientId ?? 'client-1',
      tenantId: overrides.tenantId ?? 'tenant-1',
      scope: scopes,
    },
    {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      expiresIn: '5m',
    },
  );
}

export function validEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: 'evt-1',
    tenantId: 'tenant-1',
    source: 'plugin.nestjs',
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
