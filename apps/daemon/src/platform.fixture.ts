import type { WorkItem } from '@graveshift/core';
import { RecordedHauntingSchema, type RecordedHaunting } from '@graveshift/core/recorded';
import { recoverPublication } from '@graveshift/fixer';
import { createGateway, type ModelAdapter, type ModelRequest } from '@graveshift/gateway';

import type { PrismaService } from '../../api/src/infra/prisma.service';
import { workItemData } from '../../api/test/database/fixtures';
import { createAudit, gatewayAudit } from './audit';
import { createCommandHandler } from './command-handler';
import { contextClient } from './fix-context';
import { createFixExecutor } from './fix-execution';
import { githubRecording, gitChecks } from './fix-recording';
import { agent, caller, context, envelope, policy } from './flow-fixtures';
import { createObservations } from './observations';
import { platformHttp } from './platform-http.fixture';
import { createReadHandler } from './read-handler';
import { createReadRuntime } from './reads';
import { daemonHandler } from './routes';
import { routingModel } from './routing-model';
import { workActivation } from './work-activation';
import { createWorkClient } from './work-client';
import { createWorkCommands } from './work-flow';

export const TEST_BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
// Blob SHA of the source text recorded by githubRecording() for src/main.ts.
const BASE_BLOB_SHA = '96759cc1f604468aa78a72be3c5be39abfc788b2';

export const PLATFORM_AGENTS = [
  agent(),
  agent({
    name: 'Question Agent',
    slug: 'question-agent',
    prompt: 'Fix {{VERSION}}',
    params: [{ VERSION: '' }],
  }),
  agent({
    name: 'Automatic Agent',
    slug: 'automatic-agent',
    description: 'Diagnose OOM memory resource exhaustion defect',
    role: 'diagnosis',
    autoFix: true,
  }),
];

export async function createPlatform(db: PrismaService) {
  const http = await platformHttp(db, PLATFORM_AGENTS);
  const recording = githubRecording();
  // A patch must carry a 40-hex base; the recorded client is pinned to it.
  recording.client.getBaseSha = async () => TEST_BASE_SHA;
  const models: ModelRequest[] = [];
  const audit = createAudit(http.api, caller.projectId);
  const gateway = createGateway({
    agents: PLATFORM_AGENTS.map((selected) => {
      const adapter: ModelAdapter = {
        provider: selected.provider,
        model: selected.model,
        capability: 'structured_language',
        available: () => true,
        async generateObject(request) {
          models.push(request);
          const object = request.system.includes('You are Medium')
            ? {
                category: 'resource_exhaustion',
                rootCause: 'Out of memory',
                confidence: 0.95,
                evidence: [{ ref: 'signal:1', excerpt: 'runtime.oom' }],
              }
            : request.prompt.includes('Required params:')
              ? { question: 'Which version should be fixed?' }
              : {
                  baseSha: TEST_BASE_SHA,
                  files: [
                    {
                      path: 'src/main.ts',
                      content: 'export const state = "fixed";\n',
                      linesChanged: 0,
                      baseBlobSha: BASE_BLOB_SHA,
                    },
                  ],
                };
          return { object, model: selected.model, usage: { in: 20, out: 10 } };
        },
      };
      return { agent: selected, adapter };
    }),
    config: {
      globalDailyBudgetUsd: 10,
      maxRetries: 0,
      timeoutMs: 5000,
      priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 2 } },
    },
    onAudit: gatewayAudit(audit),
  });
  const commands = createWorkCommands({
    projectId: caller.projectId,
    agents: PLATFORM_AGENTS,
    runtime: createWorkClient(http.api),
    policy,
    context: contextClient(http.api, policy),
    model: routingModel(gateway),
    audit,
    execute: createFixExecutor({
      client: recording.client,
      gateway,
      verification: { 'team/grave': { commands: [['git', 'diff', '--check']], timeoutMs: 10_000 } },
      dashboardUrl: '',
      runner: gitChecks,
    }),
    recover: (intent) => recoverPublication(recording.client, intent),
  });
  const reads = createReadRuntime({
    projectId: caller.projectId,
    api: http.api,
    sources: [],
    metricJobs: [],
  });
  const edge = {
    projectId: caller.projectId,
    token: http.token,
    timeoutMs: 30_000,
    maxBytes: 65_536,
  };
  const seedHaunting = () => {
    const facts = context();
    const view: RecordedHaunting = {
      incident: facts.incident,
      category: facts.category,
      detections: [
        {
          id: 'signal-1',
          projectId: caller.projectId,
          eventId: envelope.id,
          traceId: envelope.traceId,
          rule: 'runtime.oom',
          service: 'checkout',
          severity: 'critical',
          fingerprint: envelope.fingerprint,
          message: 'Out of memory',
          observedAt: envelope.observedAt,
        },
      ],
    };
    return http.api.post(
      '/internal/hauntings',
      { projectId: caller.projectId, eventId: 'platform:seed-haunting', view },
      RecordedHauntingSchema,
    );
  };
  http.attach(
    daemonHandler(
      createCommandHandler({ ...edge, commands }),
      createReadHandler({ ...edge, reads }),
    ),
  );
  return {
    ...http,
    models,
    recording,
    daemon: commands,
    seedHaunting,
    async seed(assignee = 'needs_agent_Assigned Agent'): Promise<RecordedHaunting> {
      const facts = context();
      const saved = await seedHaunting();
      await db.workItem.create({
        data: {
          ...workItemData(),
          assignee,
          service: saved.incident.service,
          diagnosis: facts.diagnosis,
        },
      });
      return saved;
    },
    async observe(
      onWork: (item: WorkItem, incidentId: string) => Promise<void> = workActivation(
        commands,
        caller.projectId,
      ),
    ) {
      return createObservations({
        projectId: caller.projectId,
        api: http.api,
        gateway,
        agents: PLATFORM_AGENTS,
        logs: async () => [],
        onWork,
      });
    },
  };
}
