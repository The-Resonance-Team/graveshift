import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

import type { GitHubAppAuth } from './auth';
import type { GitHubClient } from './client';

export class GitHubApiError extends GraveshiftError<'GITHUB_API_ERROR'> {
  constructor(message: string) {
    super('GITHUB_API_ERROR', message);
  }
}

const sha = z.object({ sha: z.string() });

export function createRestClient(auth: GitHubAppAuth, fetchFn: typeof fetch = fetch): GitHubClient {
  async function call<T>(
    repo: string,
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const res = await fetchFn(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await auth.installationToken(repo)}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new GitHubApiError(`${method} ${path} responded ${res.status}`);
    return schema.parse(await res.json());
  }

  return {
    async getBaseSha(repo, branch) {
      const ref = await call(repo, 'GET', `/git/ref/heads/${branch}`, z.object({ object: sha }));
      return ref.object.sha;
    },
    async getCommitTree(repo, commitSha) {
      return (await call(repo, 'GET', `/git/commits/${commitSha}`, z.object({ tree: sha }))).tree
        .sha;
    },
    async createBlob(repo, content) {
      return (await call(repo, 'POST', '/git/blobs', sha, { content, encoding: 'utf-8' })).sha;
    },
    async createTree(repo, baseTree, entries) {
      const tree = entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha }));
      return (await call(repo, 'POST', '/git/trees', sha, { base_tree: baseTree, tree })).sha;
    },
    async createCommit(repo, message, tree, parent) {
      return (await call(repo, 'POST', '/git/commits', sha, { message, tree, parents: [parent] }))
        .sha;
    },
    async createRef(repo, ref, commitSha) {
      await call(repo, 'POST', '/git/refs', z.unknown(), { ref, sha: commitSha });
    },
    async createPullRequest(repo, pr) {
      const created = await call(
        repo,
        'POST',
        '/pulls',
        z.object({ number: z.number(), html_url: z.string() }),
        pr,
      );
      return { number: created.number, url: created.html_url };
    },
    async addLabels(repo, number, labels) {
      await call(repo, 'POST', `/issues/${number}/labels`, z.unknown(), { labels });
    },
    async listCheckRuns(repo, commitSha) {
      const runs = await call(
        repo,
        'GET',
        `/commits/${commitSha}/check-runs`,
        z.object({
          check_runs: z.array(
            z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() }),
          ),
        }),
      );
      return runs.check_runs;
    },
    async getPullRequest(repo, number) {
      const pr = await call(
        repo,
        'GET',
        `/pulls/${number}`,
        z.object({ state: z.enum(['open', 'closed']), merged: z.boolean(), head: sha }),
      );
      return { state: pr.state, merged: pr.merged, headSha: pr.head.sha };
    },
  };
}
