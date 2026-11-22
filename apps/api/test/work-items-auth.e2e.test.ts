import {
  type CallHandler,
  type ExecutionContext,
  Global,
  Injectable,
  type INestApplication,
  type NestInterceptor,
  Module,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createSubtasks, NEEDS_HUMAN, type WorkItem } from '@graveshift/core';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { CREDENTIAL_CONFIG, type AuthConfig } from '../src/auth/auth.types';
import type { FixDeps } from '../src/fix/fix.types';
import { WORK_ITEM_POLICY, type WorkItemPolicy } from '../src/work-items/work-item.policy';
import type { WorkItemRequest } from '../src/work-items/work-item.scope.guard';
import { WORK_ITEM_SEED, WorkItemStore } from '../src/work-items/work-item.store';
import { accessToken, TEST_CONFIG } from './fakes/auth-test-helpers';
import { fakeFixDeps, FIX_DEPS, fixCalls } from './fakes/fake-fix-deps';

const POLICY: WorkItemPolicy = { agentNames: ['SRE Bot'], clientConfig: {}, autoFixEnabled: false };

function item(id: string): WorkItem {
  return {
    id,
    title: `Work item ${id}`,
    description: '',
    successCriteria: [],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'medium',
    assignee: NEEDS_HUMAN,
    reporter: 'wraith',
    startDate: null,
    dueDate: null,
    sprint: null,
    parent: null,
    labels: [],
    team: 'sre',
    watchers: [],
    severity: 'warning',
    service: 'api',
    diagnosisRef: `diag-${id}`,
    fixPriority: 100,
    draftPr: null,
  };
}

// The store counts reads so a test can prove a guard ran before any store access.
class CountingStore {
  reads = 0;
  private readonly map = new Map<string, WorkItem>([
    ['wi-1', item('wi-1')],
    ['wi-2', item('wi-2')],
  ]);

  list(): WorkItem[] {
    this.reads += 1;
    return [...this.map.values()];
  }

  get(id: string): WorkItem | undefined {
    this.reads += 1;
    return this.map.get(id);
  }

  save(next: WorkItem): void {
    this.map.set(next.id, next);
  }
}

interface SeenPrincipal {
  clientId: string;
  projectId: string;
  auditProjectId: string;
}

// An interceptor runs after the guards. It records the principal the guards put on the
// request, so a test can read an authenticated projectId without changing the handlers.
@Injectable()
class CapturePrincipalInterceptor implements NestInterceptor {
  static seen: SeenPrincipal[] = [];

  intercept(context: ExecutionContext, next: CallHandler) {
    const httpRequest = context.switchToHttp().getRequest<WorkItemRequest>();
    CapturePrincipalInterceptor.seen.push({
      clientId: httpRequest.user?.clientId ?? '',
      projectId: httpRequest.user?.projectId ?? '',
      auditProjectId: httpRequest.auditScope?.projectId ?? '',
    });
    return next.handle();
  }
}

@Global()
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: CapturePrincipalInterceptor }],
})
class CaptureModule {}

interface BuildOptions {
  config?: Partial<AuthConfig>;
  deps?: FixDeps;
  capture?: boolean;
}

async function buildApp(options: BuildOptions = {}): Promise<{
  app: INestApplication;
  store: CountingStore;
  jwt: JwtService;
}> {
  const store = new CountingStore();
  const config: AuthConfig = { ...TEST_CONFIG, ...options.config };
  const builder = Test.createTestingModule({
    imports: options.capture === true ? [AppModule, CaptureModule] : [AppModule],
  })
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(config)
    .overrideProvider(WORK_ITEM_SEED)
    .useValue([])
    .overrideProvider(WorkItemStore)
    .useValue(store)
    .overrideProvider(WORK_ITEM_POLICY)
    .useValue(POLICY)
    .overrideProvider(FIX_DEPS)
    .useValue(options.deps ?? fakeFixDeps());
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return { app, store, jwt: moduleRef.get(JwtService) };
}

// tokens:manage satisfies the shared client-credentials guard. The route scope is what
// the local work-item scope guard checks. No real secret or network call is used here.
function token(jwt: JwtService, scopes: string[], overrides: Record<string, string> = {}): string {
  return accessToken(jwt, scopes, overrides);
}

type PendingCall = ReturnType<ReturnType<typeof request>['get']>;

function call(app: INestApplication, bearer?: string) {
  const server = app.getHttpServer();
  const agent = request(server);
  const withAuth = (pending: PendingCall) =>
    bearer === undefined ? pending : pending.set('Authorization', `Bearer ${bearer}`);
  return {
    get: (path: string) => withAuth(agent.get(path)),
    post: (path: string, body: object) => withAuth(agent.post(path).send(body)),
  };
}

describe('work item route guards (e2e)', () => {
  const opened: INestApplication[] = [];
  const track = async (options: BuildOptions = {}) => {
    const built = await buildApp(options);
    opened.push(built.app);
    return built;
  };

  afterEach(async () => {
    CapturePrincipalInterceptor.seen = [];
    await Promise.all(opened.splice(0).map((app) => app.close()));
  });

  test('anonymous requests get 401 before the store is read', async () => {
    const { app, store } = await track();
    await call(app).get('/api/work-items').expect(401);
    await call(app).get('/api/work-items/wi-1').expect(401);
    await call(app).post('/api/work-items/wi-1/triage', { assignee: 'needs_human' }).expect(401);
    await call(app).post('/api/work-items/wi-1/fix-now', {}).expect(401);
    expect(store.reads).toBe(0);
    expect(fixCalls()).toHaveLength(0);
  });

  test('an incidents:read token lists and gets a work item but cannot trigger', async () => {
    const { app, jwt, store } = await track();
    const reader = token(jwt, ['tokens:manage', 'incidents:read']);
    await call(app, reader).get('/api/work-items').expect(200);
    await call(app, reader).get('/api/work-items/wi-1').expect(200);
    await call(app, reader)
      .post('/api/work-items/wi-1/triage', { assignee: 'needs_human' })
      .expect(403);
    await call(app, reader).post('/api/work-items/wi-1/fix-now', {}).expect(403);
    // The two GETs are the only reads. A denied POST never reaches the store.
    expect(store.reads).toBe(2);
    expect(fixCalls()).toHaveLength(0);
  });

  test('a fix:trigger token triages and fixes now but cannot list or get', async () => {
    const { app, jwt } = await track();
    const trigger = token(jwt, ['tokens:manage', 'fix:trigger']);
    await call(app, trigger)
      .post('/api/work-items/wi-1/triage', { assignee: 'needs_human' })
      .expect(200);
    await call(app, trigger).post('/api/work-items/wi-2/fix-now', {}).expect(200);
    await call(app, trigger).get('/api/work-items').expect(403);
    await call(app, trigger).get('/api/work-items/wi-1').expect(403);
    expect(fixCalls().some((entry) => entry.method === 'createPullRequest')).toBe(true);
  });

  test('a token with neither route scope is denied on all four routes', async () => {
    const { app, jwt, store } = await track();
    const other = token(jwt, ['tokens:manage', 'logs:read']);
    await call(app, other).get('/api/work-items').expect(403);
    await call(app, other).get('/api/work-items/wi-1').expect(403);
    await call(app, other)
      .post('/api/work-items/wi-1/triage', { assignee: 'needs_human' })
      .expect(403);
    await call(app, other).post('/api/work-items/wi-1/fix-now', {}).expect(403);
    expect(store.reads).toBe(0);
    expect(fixCalls()).toHaveLength(0);
  });

  test('repeated calls get 429 from the throttle before the store is read', async () => {
    const { app, jwt, store } = await track({ config: { eventRateLimit: 3 } });
    const reader = token(jwt, ['tokens:manage', 'incidents:read']);
    const statuses: number[] = [];
    // Calls run one by one so the throttle window counts them in order.
    await Array.from({ length: 6 }).reduce(async (previous) => {
      await previous;
      const response = await call(app, reader).get('/api/work-items');
      statuses.push(response.status);
    }, Promise.resolve());
    expect(statuses.filter((status) => status === 200)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(3);
    expect(store.reads).toBe(3);
  });

  test('POST fix-now carries an authenticated projectId on the request principal', async () => {
    const config: AuthConfig = {
      ...TEST_CONFIG,
      oauthClients: {
        ...TEST_CONFIG.oauthClients,
        'client-audit': {
          secret: 'test-client-secret-audit-01',
          projectId: 'project-audit-77',
          scopes: ['tokens:manage', 'fix:trigger'],
        },
      },
    };
    const { app, jwt } = await track({ config, capture: true });
    const auditToken = token(jwt, ['tokens:manage', 'fix:trigger'], {
      clientId: 'client-audit',
      projectId: 'project-audit-77',
    });
    await call(app, auditToken).post('/api/work-items/wi-1/fix-now', {}).expect(200);
    expect(CapturePrincipalInterceptor.seen).toHaveLength(1);
    const seen = CapturePrincipalInterceptor.seen[0] as SeenPrincipal;
    expect(seen.clientId).toBe('client-audit');
    expect(seen.projectId).toBe('project-audit-77');
    expect(seen.auditProjectId).toBe('project-audit-77');
  });
});
