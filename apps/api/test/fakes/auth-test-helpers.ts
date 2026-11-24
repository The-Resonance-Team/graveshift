import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { AuditDraft, AuditEntry, EventEnvelope } from '@graveshift/core';
import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';

import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import {
  AUDIT_SINK,
  type AuditRecord,
  type AuditSink,
  type AuditTransaction,
} from '../../src/audit/audit.sink';
import { DeployRepo } from '../../src/deploys/deploy.repo';
import { FakeDeployRepo } from '../../src/deploys/testing/deploy-repo.fakes';
import {
  CREDENTIAL_CONFIG,
  CREDENTIAL_REPO,
  EVENT_PUBLISHER,
  SENTRY_CREDENTIAL_VERIFIER,
  type AuthConfig,
  type CredentialVerifier,
} from '../../src/auth/auth.types';
import { BOOT_CONFIG } from '../../src/config/boot.config';
import { DEFAULT_DAEMON_GRANT, IDENTITY_REPO } from '../../src/identity/identity.types';
import { FakeIdentityRepo } from '../../src/identity/testing/fake-identity.repo';
import { TEST_CONFIG, testBootConfig, testOAuthClients } from './auth-test-config';
import { FakeCredentialRepo } from './fake-credential-repo';

export { TEST_CONFIG };

/** The in-memory adapter at the `AUDIT_SINK` seam. No network or database call is made. */
export class FakeAuditRepo implements AuditSink {
  readonly appended: AuditRecord[] = [];

  append(projectId: string, draft: AuditDraft): Promise<AuditEntry> {
    this.appended.push({ ...structuredClone(draft), projectId });
    return Promise.resolve(this.entry());
  }

  appendInTx(_tx: AuditTransaction, projectId: string, draft: AuditDraft): Promise<AuditEntry> {
    return this.append(projectId, draft);
  }

  transaction<Result>(work: (tx: AuditTransaction) => Promise<Result>): Promise<Result> {
    return work(undefined as unknown as AuditTransaction);
  }

  private entry(): AuditEntry {
    return {
      seq: this.appended.length,
      at: new Date().toISOString(),
      actor: 'fixture',
      type: 'fixture',
      payload: {},
      prevHash: '0'.repeat(64),
      hash: '0'.repeat(64),
    };
  }
}

export interface AuthTestApp {
  app: INestApplication;
  jwt: JwtService;
  repo: FakeCredentialRepo;
  identity: FakeIdentityRepo;
  publisher: InMemoryPublisher;
  audit: FakeAuditRepo;
  deploys: FakeDeployRepo;
}

/** Seeds the in-memory OAuth client registry and the stored deployment grant. */
export function testIdentityRepo(): FakeIdentityRepo {
  const identity = new FakeIdentityRepo();
  for (const client of testOAuthClients()) void identity.clients.set(client.clientId, client);
  void identity.grants.set(DEFAULT_DAEMON_GRANT, {
    id: 'test-grant',
    name: DEFAULT_DAEMON_GRANT,
    projectIds: ['12345', '12346'],
  });
  return identity;
}

export async function buildAuthApp(
  overrides: Partial<AuthConfig> = {},
  publisherOverride?: InMemoryPublisher,
  sentryVerifier?: CredentialVerifier,
): Promise<AuthTestApp> {
  const repo = new FakeCredentialRepo();
  const identity = testIdentityRepo();
  const audit = new FakeAuditRepo();
  const deploys = new FakeDeployRepo();
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
  return { app, jwt: moduleRef.get(JwtService), repo, identity, publisher, audit, deploys };
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
