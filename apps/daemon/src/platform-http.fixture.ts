import type { AgentConfig } from '@graveshift/agents';
import { type WorkCommands, WORK_COMMANDS } from '@graveshift/work';
import { ValidationPipe, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';

import { InternalAuditController } from '../../api/src/audit/audit.controller';
import { AuditRepo } from '../../api/src/audit/audit.repo';
import { AUDIT_READER, AUDIT_SINK } from '../../api/src/audit/audit.sink';
import { DeployRepo } from '../../api/src/deploys/deploy.repo';
import { DeploymentClosure } from '../../api/src/deploys/deployment-closure';
import { BOOT_CONFIG } from '../../api/src/config/boot.config';
import { ProjectGrant } from '../../api/src/internal/project-grant';
import { DaemonWorkClient } from '../../api/src/fix/daemon-work.client';
import { HauntingController } from '../../api/src/hauntings/haunting.controller';
import { HauntingRepo } from '../../api/src/hauntings/haunting.repo';
import { HauntingService } from '../../api/src/hauntings/haunting.service';
import type { PrismaService } from '../../api/src/infra/prisma.service';
import { InternalGuard } from '../../api/src/internal/internal.guard';
import { PolicyContextController } from '../../api/src/internal/policy-context.controller';
import { PolicyContextService } from '../../api/src/internal/policy-context.service';
import { InternalWorkController } from '../../api/src/work-items/controllers/internal-work.controller';
import { WorkIngressController } from '../../api/src/work-items/controllers/work-ingress.controller';
import { WorkItemsController } from '../../api/src/work-items/controllers/work-items.controller';
import { WorkIngressService } from '../../api/src/work-items/work-ingress.service';
import { WorkItemRepo } from '../../api/src/work-items/work-item.repo';
import { createPrivateApi } from './api-client';
import { caller, policy } from './flow-fixtures';
import type { FetchHandler } from './routes';
import { testProjectGrant } from '../../api/src/internal/testing/project-grant.fixture';

const apiToken = 'platform-test-api-token-long-enough';
const daemonToken = 'platform-test-daemon-token-long-enough';

export interface HttpCapture {
  side: 'api' | 'daemon';
  path: string;
  authenticated: boolean;
}

function fetchAdapter(reply: (incoming: Request) => Promise<Response>): typeof fetch {
  return Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const incoming =
        input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      return reply(incoming);
    },
    { preconnect: fetch.preconnect },
  );
}

export async function platformHttp(
  db: PrismaService,
  agents: readonly AgentConfig[],
  projects: string[] = [caller.projectId],
) {
  const audit = new AuditRepo(db);
  const work = new WorkItemRepo(db, audit, agents, testProjectGrant(projects));
  const deploys = new DeployRepo(db, audit);
  const hauntings = new HauntingRepo(db, audit);
  const captured: HttpCapture[] = [];
  const responses: Array<{ side: 'api' | 'daemon'; path: string; status: number; bytes: number }> =
    [];
  let handler: FetchHandler = () =>
    Response.json({ message: 'Daemon is starting' }, { status: 503 });
  const daemonFetch = fetchAdapter(async (incoming) => {
    captured.push({
      side: 'daemon',
      path: new URL(incoming.url).pathname,
      authenticated: incoming.headers.get('authorization') === `Bearer ${daemonToken}`,
    });
    const response = await handler(incoming);
    responses.push({
      side: 'daemon',
      path: new URL(incoming.url).pathname,
      status: response.status,
      bytes: Number(response.headers.get('content-length') ?? 0),
    });
    return response;
  });
  const moduleRef = await Test.createTestingModule({
    imports: [
      HttpClientModule.register({
        name: 'daemon',
        baseUrl: 'http://127.0.0.1:2602',
        retry: false,
        headers: { authorization: `Bearer ${daemonToken}` },
        fetch: daemonFetch,
      }),
    ],
    controllers: [
      InternalWorkController,
      InternalAuditController,
      HauntingController,
      PolicyContextController,
      WorkItemsController,
      WorkIngressController,
    ],
    providers: [
      InternalGuard,
      { provide: ProjectGrant, useValue: testProjectGrant(projects) },
      HauntingService,
      PolicyContextService,
      WorkIngressService,
      DaemonWorkClient,
      { provide: WORK_COMMANDS, useExisting: DaemonWorkClient },
      { provide: AuditRepo, useValue: audit },
      { provide: AUDIT_SINK, useValue: audit },
      { provide: AUDIT_READER, useValue: audit },
      { provide: WorkItemRepo, useValue: work },
      { provide: HauntingRepo, useValue: hauntings },
      { provide: DeployRepo, useValue: deploys },
      { provide: DeploymentClosure, useValue: new DeploymentClosure(deploys) },
      { provide: BOOT_CONFIG, useValue: { agents, policy } },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          GRAVESHIFT_API_INTERNAL_TOKEN: apiToken,
          GRAVESHIFT_DAEMON_INTERNAL_TOKEN: daemonToken,
        }),
      },
    ],
  })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(AuthGuard('oauth-client-credentials'))
    .useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest<{ user: object }>().user = {
          projectId: caller.projectId,
          clientId: 'platform-person',
          // The management surface, the read scope and the Fix trigger: this composition runs real routes.
          scopes: ['tokens:manage', 'incidents:read', 'fix:trigger'],
        };
        return true;
      },
    })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );
  await app.init();
  const apiFetch = fetchAdapter(async (incoming) => {
    const path = new URL(incoming.url).pathname;
    captured.push({
      side: 'api',
      path,
      authenticated: incoming.headers.get('authorization') === `Bearer ${apiToken}`,
    });
    const outgoing = request(app.getHttpServer()).post(path);
    for (const header of ['authorization', 'content-type']) {
      const value = incoming.headers.get(header);
      if (value !== null) outgoing.set(header, value);
    }
    const response = await outgoing.send(await incoming.text());
    responses.push({ side: 'api', path, status: response.status, bytes: response.text.length });
    return new Response(response.text, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    app,
    audit,
    work,
    hauntings,
    captured,
    responses,
    token: daemonToken,
    api: createPrivateApi({
      origin: 'http://127.0.0.1:3000',
      token: apiToken,
      timeoutMs: 10_000,
      fetch: apiFetch,
    }),
    attach: (next: FetchHandler) => {
      handler = next;
    },
    commands: moduleRef.get<WorkCommands>(WORK_COMMANDS),
    close: () => app.close(),
  };
}

export function publicCommand(
  app: INestApplication,
  id: string,
  action: string,
  commandId: string,
  body: object,
) {
  return request(app.getHttpServer())
    .post(`/api/work-items/${encodeURIComponent(id)}/${action}`)
    .set('idempotency-key', commandId)
    .send(body);
}
