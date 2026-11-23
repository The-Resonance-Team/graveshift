import { mergeAgentTemplates } from '@graveshift/agents';
import type { GraveshiftConfig } from '@graveshift/config';
import { GraveshiftError } from '@graveshift/core';
import {
  createAppAuth,
  type CheckRun,
  createGitHubSourceProvider,
  createRestClient,
  createSandboxWorkspace,
  type CommandRunner,
  type GitHubClient,
  type PullRequestState,
  type TreeEntry,
  type TreeFile,
} from '@graveshift/fixer';
import {
  createAdapter,
  createGateway,
  resolveApiKey,
  type AuditEvent,
  type GatewayResult,
  type GatewayTask,
} from '@graveshift/gateway';
import { ModeSchema } from '@graveshift/policy';
import { z } from 'zod';

import { createLocalFixContextProvider, type WorkItemReader } from './fix.context';
import { SpendTracker } from './fix.spend';
import type { FixDeps } from './fix.types';

const EnvModeSchema = z.object({ GRAVESHIFT_MODE: ModeSchema.optional() });

export class FixConfigError extends GraveshiftError<'FIX_CONFIG_ERROR'> {
  constructor(message: string) {
    super('FIX_CONFIG_ERROR', message);
  }
}

export interface FixDepsOptions {
  /** The store the open-PR counter reads; the same instance the routes use. */
  readonly store: WorkItemReader;
  // Test seams. Production never passes them; emulator URLs never enter config.
  readonly githubFetch?: typeof fetch;
  readonly aiFetch?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
  readonly onAudit?: (event: AuditEvent) => unknown;
  readonly now?: () => Date;
  /**
   * The process runner the sandbox uses to start a check command. Production
   * uses the platform network jail; a test host that blocks the jail still
   * runs the real checks through an injected runner.
   */
  readonly sandboxRunner?: CommandRunner;
}

const requiredEnv = (name: string, env: Record<string, string | undefined>): string => {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FixConfigError(`${name} is not set`);
  }
  return value.trim();
};

// The model key and GitHub App key are not needed by most routes. Build the real
// collaborators on first fix use, so boot needs no secret and a fix fails closed
// with a typed error when a key is missing.
class LazyGateway {
  private current?: { run<T>(task: GatewayTask<T>): Promise<GatewayResult<T>> };

  constructor(private readonly create: () => ReturnType<typeof createGateway>) {}

  async run<T>(task: GatewayTask<T>): Promise<GatewayResult<T>> {
    this.current ??= this.create();
    return this.current.run(task);
  }
}

class LazyGitHubClient implements GitHubClient {
  private current?: GitHubClient;

  constructor(private readonly create: () => GitHubClient) {}

  private get client(): GitHubClient {
    this.current ??= this.create();
    return this.current;
  }

  getBaseSha(repo: string, branch: string): Promise<string> {
    return this.client.getBaseSha(repo, branch);
  }
  getCommitTree(repo: string, commitSha: string): Promise<string> {
    return this.client.getCommitTree(repo, commitSha);
  }
  listTree(repo: string, treeSha: string): Promise<TreeFile[]> {
    return this.client.listTree(repo, treeSha);
  }
  getBlobBytes(repo: string, blobSha: string): Promise<Uint8Array> {
    return this.client.getBlobBytes(repo, blobSha);
  }
  createBlob(repo: string, content: string): Promise<string> {
    return this.client.createBlob(repo, content);
  }
  createTree(repo: string, baseTree: string, entries: TreeEntry[]): Promise<string> {
    return this.client.createTree(repo, baseTree, entries);
  }
  createCommit(repo: string, message: string, tree: string, parent: string): Promise<string> {
    return this.client.createCommit(repo, message, tree, parent);
  }
  createRef(repo: string, ref: string, sha: string): Promise<void> {
    return this.client.createRef(repo, ref, sha);
  }
  createPullRequest(
    repo: string,
    pr: { title: string; body: string; head: string; base: string; draft: true },
  ): Promise<{ number: number; url: string }> {
    return this.client.createPullRequest(repo, pr);
  }
  addLabels(repo: string, number: number, labels: string[]): Promise<void> {
    return this.client.addLabels(repo, number, labels);
  }
  listCheckRuns(repo: string, sha: string): Promise<CheckRun[]> {
    return this.client.listCheckRuns(repo, sha);
  }
  getPullRequest(repo: string, number: number): Promise<PullRequestState> {
    return this.client.getPullRequest(repo, number);
  }
}

export function createFixDeps(config: GraveshiftConfig, options: FixDepsOptions): FixDeps {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const parsedEnv = EnvModeSchema.safeParse(env);
  if (!parsedEnv.success) {
    throw new FixConfigError(`GRAVESHIFT_MODE is invalid: ${parsedEnv.error.message}`);
  }
  const agent = mergeAgentTemplates(config.agents.system, config.agents.client).find(
    (entry) => entry.name === config.fix.agent,
  );
  if (agent === undefined) throw new FixConfigError(`no Agent named ${config.fix.agent}`);

  const repo =
    config.policy.github.repos.find((candidate) => candidate.services.includes('api')) ??
    config.policy.github.repos[0];
  if (repo === undefined) throw new FixConfigError('policy has no github repo for a fix');
  const installation = config.fix.github.installations[repo.repo];
  if (installation === undefined) {
    throw new FixConfigError(`no GitHub App installation for ${repo.repo}`);
  }

  // Every terminal model call reports its cost here; the policy gate compares
  // it against the daily budget before it may allow the next one.
  const spend = new SpendTracker(now);
  const gateway = new LazyGateway(() => {
    if (resolveApiKey(agent, env) === undefined) {
      throw new FixConfigError(
        `apiKeyEnv ${agent.apiKeyEnv} is unset or holds a placeholder value`,
      );
    }
    const adapter = createAdapter(agent, {
      env,
      ...(options.aiFetch === undefined ? {} : { fetch: options.aiFetch }),
    });
    return createGateway({
      agents: [{ agent, adapter }],
      config: config.fix.gateway,
      onAudit: (event) => {
        spend.record(event);
        return options.onAudit?.(event);
      },
    });
  });

  const client = new LazyGitHubClient(() => {
    const auth = createAppAuth({
      appId: requiredEnv(config.fix.github.appIdEnv, env),
      privateKeyPem: requiredEnv(config.fix.github.privateKeyEnv, env),
      installations: { [repo.repo]: installation },
      ...(options.githubFetch === undefined ? {} : { fetch: options.githubFetch }),
    });
    return createRestClient(auth, options.githubFetch ?? fetch);
  });

  return {
    policy: config.policy,
    repo,
    gateway,
    client,
    source: createGitHubSourceProvider(client),
    workspace: createSandboxWorkspace(
      options.sandboxRunner === undefined ? {} : { runner: options.sandboxRunner },
    ),
    sandbox: config.fix.sandbox,
    context: createLocalFixContextProvider({
      store: options.store,
      spendTodayUsd: () => spend.spendTodayUsd(),
      now,
    }),
    agent: agent.name,
    autoFixEnabled: config.fix.enabled,
    promptTemplate: config.fix.promptTemplate,
    now,
    agentMeta: {
      name: agent.name,
      role: agent.role,
      description: agent.description,
      prompt: agent.prompt,
      model: agent.model,
      provider: agent.provider,
      dailyBudgetUsd: agent.dailyBudgetUsd,
    },
    ...(parsedEnv.data.GRAVESHIFT_MODE === undefined
      ? {}
      : { envMode: parsedEnv.data.GRAVESHIFT_MODE }),
  };
}
