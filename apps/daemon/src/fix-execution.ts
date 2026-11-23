import {
  createAppAuth,
  createRestClient,
  planPublication,
  prepareSource,
  publishVerified,
  recoverPublication,
  verifyPatch,
  type GitHubClient,
  type VerificationConfig,
  type SandboxRunner,
} from '@graveshift/fixer';
import type { Gateway } from '@graveshift/gateway';
import { wrapUntrusted } from '@graveshift/agents/untrusted';
import { generatePatch } from '@graveshift/patch';
import { PATCH_SYSTEM } from '@graveshift/patch/generate';
import { z } from 'zod';

import { currentAuditScope, type WriteAudit } from './audit';
import { ExecutionFailure, type FixExecutor } from './execution';
import { withModelContext } from './model-context';
import { cancellableGitHub } from './cancellable-github';
import { parseDaemonEnv } from './env';

export interface ExecutorOptions {
  client: GitHubClient;
  gateway: Pick<Gateway, 'run'>;
  verification: Readonly<Record<string, VerificationConfig>>;
  dashboardUrl: string;
  audit: WriteAudit;
  runner?: SandboxRunner;
}

export const FIX_BASE_SHA_AUDIT_TYPE = 'fix.base_sha';

export function createFixExecutor(options: ExecutorOptions): FixExecutor {
  return async (input) => {
    input.signal?.throwIfAborted();
    // Checked before the first model call: a patch call with no authenticated audit scope would
    // spend budget on a model call whose durable entry has no chain to belong to.
    const scope = currentAuditScope();
    if (scope === undefined) {
      throw new ExecutionFailure('audit_failed', 'No authenticated audit scope for the Agent');
    }
    const baseSha = input.context.deploymentId;
    if (!/^[0-9a-f]{40}$/.test(baseSha)) {
      throw new ExecutionFailure('fix_error', 'No bound Deployment for this Fix');
    }
    try {
      await options.audit(
        {
          key: `fix:${input.attempt.id}:base:${baseSha}`,
          actor: scope.actor,
          type: FIX_BASE_SHA_AUDIT_TYPE,
          incidentId: input.context.incident.id,
          payload: {
            baseSha,
            deploymentId: baseSha,
            repo: input.context.repo.repo,
            workItemId: input.snapshot.item.id,
            attemptId: input.attempt.id,
            service: input.context.incident.service,
          },
        },
        scope,
      );
    } catch {
      throw new ExecutionFailure('audit_failed', 'The base SHA audit was not persisted');
    }
    const client = cancellableGitHub(options.client, input.signal);
    const verification = options.verification[input.context.repo.repo];
    if (verification === undefined)
      throw new ExecutionFailure('fix_error', 'Repository verification is not configured');
    const snapshot = await prepareSource(input.context.repo, client, baseSha);
    input.signal?.throwIfAborted();
    let auditFailed = false;
    const generated = await generatePatch({
      agent: input.agent.name,
      system: PATCH_SYSTEM,
      diagnosis: JSON.stringify(input.context.diagnosis),
      rules: snapshot.rules,
      gateway: {
        async run(task) {
          const result = await withModelContext(
            {
              incidentId: input.context.incident.id,
              service: input.context.incident.service,
              deploymentId: baseSha,
            },
            () =>
              options.gateway.run({
                ...task,
                system: `${task.system}\nAssigned Agent instructions:\n${input.prompt}`,
                prompt: `${task.prompt}\nSource base: ${snapshot.baseSha}\n${wrapUntrusted('repository_source', JSON.stringify(snapshot.files.map(({ path, content, blobSha }) => ({ path, blobSha, content }))))}`,
                ...(input.signal === undefined ? {} : { signal: input.signal }),
              }),
          );
          auditFailed = result.status === 'unavailable' && result.reason === 'audit_unavailable';
          return result;
        },
      },
    });
    if (!generated.ok)
      throw new ExecutionFailure(
        auditFailed ? 'audit_failed' : 'patch_rejected',
        'Patch generation failed',
      );
    input.signal?.throwIfAborted();
    const verified = await verifyPatch({
      snapshot,
      patch: generated.patch,
      ...verification,
      ...(options.runner === undefined ? {} : { runner: options.runner }),
    });
    const publication = {
      client,
      repo: input.context.repo,
      snapshot,
      verified,
      incident: input.context.incident,
      diagnosis: input.context.diagnosis,
      category: input.context.category,
      dashboardUrl: options.dashboardUrl,
      headline: input.snapshot.item.title,
    };
    const intent = planPublication(publication);
    return {
      intent,
      publish: () => publishVerified({ ...publication, plan: intent }),
      // verifyPatch owns and removes its isolated workspace before it returns its receipt.
      dispose: async () => {},
    };
  };
}

const parseJson = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};
const ExecutionEnvSchema = z.object({
  GRAVESHIFT_GITHUB_APP_ID: z.string().regex(/^\d+$/),
  GRAVESHIFT_GITHUB_PRIVATE_KEY_PEM: z.string().min(1),
  GRAVESHIFT_GITHUB_INSTALLATIONS: z.preprocess(
    parseJson,
    z.record(z.string().regex(/^[^/\s]+\/[^/\s]+$/), z.number().int().positive()),
  ),
  GRAVESHIFT_VERIFY_COMMANDS: z.preprocess(
    parseJson,
    z.record(z.string(), z.array(z.array(z.string().min(1)).min(1)).min(1)),
  ),
  GRAVESHIFT_VERIFY_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(30_000),
  GRAVESHIFT_DASHBOARD_URL: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    })
    .optional(),
});

export function executorFromEnv(
  gateway: Pick<Gateway, 'run'>,
  env: Record<string, string | undefined>,
  audit: WriteAudit,
) {
  const config = parseDaemonEnv(ExecutionEnvSchema, env, 'Fix execution configuration is invalid');
  const client = createRestClient(
    createAppAuth({
      appId: config.GRAVESHIFT_GITHUB_APP_ID,
      privateKeyPem: config.GRAVESHIFT_GITHUB_PRIVATE_KEY_PEM,
      installations: config.GRAVESHIFT_GITHUB_INSTALLATIONS,
    }),
  );
  const verification = Object.fromEntries(
    Object.entries(config.GRAVESHIFT_VERIFY_COMMANDS).map(([repo, commands]) => [
      repo,
      { commands, timeoutMs: config.GRAVESHIFT_VERIFY_TIMEOUT_MS },
    ]),
  );
  const execute = createFixExecutor({
    client,
    gateway,
    verification,
    dashboardUrl: config.GRAVESHIFT_DASHBOARD_URL ?? '',
    audit,
  });
  return {
    execute,
    recover: (intent: Parameters<typeof recoverPublication>[1]) =>
      recoverPublication(client, intent),
  };
}
