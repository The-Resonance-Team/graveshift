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
const segment = (value: string) => encodeURIComponent(value);
const refPath = (value: string) => value.split('/').map(segment).join('/');
const treeResponse = z.object({
  truncated: z.boolean(),
  tree: z
    .array(
      z.object({
        path: z.string(),
        sha: z.string(),
        mode: z.string(),
        type: z.enum(['blob', 'tree', 'commit']),
        size: z.number().int().nonnegative().optional(),
      }),
    )
    .max(20_000),
});
const draftResponse = z
  .array(
    z.object({
      number: z.number().int().positive(),
      html_url: z.string(),
      draft: z.boolean(),
      head: z.object({
        ref: z.string(),
        sha: z.string(),
        repo: z.object({ full_name: z.string() }),
      }),
    }),
  )
  .max(2);

async function readJson(response: Response): Promise<unknown> {
  if (response.body === null) throw new GitHubApiError('empty GitHub response');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const value of response.body) {
    bytes += value.byteLength;
    if (bytes > 8 * 1024 * 1024) throw new GitHubApiError('GitHub response exceeds limit');
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createRestClient(auth: GitHubAppAuth, fetchFn: typeof fetch = fetch): GitHubClient {
  async function call<T>(
    repo: string,
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const parts = repo.split('/');
    if (parts.length !== 2 || parts.some((part) => part === '' || part === '.' || part === '..')) {
      throw new GitHubApiError('invalid repository');
    }
    const res = await fetchFn(
      `https://api.github.com/repos/${parts.map(segment).join('/')}${path}`,
      {
        method,
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
        headers: {
          authorization: `Bearer ${await auth.installationToken(repo)}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!res.ok) throw new GitHubApiError(`${method} GitHub request responded ${res.status}`);
    return schema.parse(await readJson(res));
  }

  return {
    async getCommitTree(repo, commitSha) {
      return (
        await call(repo, 'GET', `/git/commits/${segment(commitSha)}`, z.object({ tree: sha }))
      ).tree.sha;
    },
    async getTree(repo, treeSha) {
      const response = await call(
        repo,
        'GET',
        `/git/trees/${segment(treeSha)}?recursive=1`,
        treeResponse,
      );
      if (response.truncated) throw new GitHubApiError('incomplete GitHub tree');
      return response.tree
        .filter((entry) => entry.type !== 'tree')
        .map((entry) => ({
          path: entry.path,
          blobSha: entry.sha,
          mode: entry.mode,
          ...(entry.size === undefined ? {} : { size: entry.size }),
        }));
    },
    async readBlob(repo, blobSha) {
      const blob = await call(
        repo,
        'GET',
        `/git/blobs/${segment(blobSha)}`,
        z.object({
          sha: z.string(),
          encoding: z.literal('base64'),
          content: z.string(),
          size: z
            .number()
            .int()
            .min(0)
            .max(1024 * 1024),
        }),
      );
      const encoded = blob.content.replace(/\s/g, '');
      const bytes = Buffer.from(encoded, 'base64');
      if (
        blob.sha !== blobSha ||
        bytes.length !== blob.size ||
        bytes.toString('base64') !== encoded
      ) {
        throw new GitHubApiError('invalid GitHub blob');
      }
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (content.includes('\0')) throw new GitHubApiError('binary GitHub blob');
      return content;
    },
    async getExistingDraft(repo, branch, baseSha) {
      const head = branch.replace(/^refs\/heads\//, '');
      const owner = repo.split('/')[0];
      const query = new URLSearchParams({ state: 'open', head: `${owner}:${head}`, per_page: '2' });
      const drafts = await call(repo, 'GET', `/pulls?${query}`, draftResponse);
      if (drafts.length === 0) return undefined;
      const existing = drafts[0];
      if (
        drafts.length !== 1 ||
        !existing ||
        !existing.draft ||
        existing.head.ref !== head ||
        existing.head.repo.full_name.toLowerCase() !== repo.toLowerCase()
      ) {
        throw new GitHubApiError('ambiguous existing draft');
      }
      const [commit, ref] = await Promise.all([
        call(
          repo,
          'GET',
          `/git/commits/${segment(existing.head.sha)}`,
          z.object({
            sha: z.string(),
            parents: z.array(sha),
          }),
        ),
        call(repo, 'GET', `/git/ref/heads/${refPath(head)}`, z.object({ object: sha })),
      ]);
      if (
        commit.sha !== existing.head.sha ||
        ref.object.sha !== existing.head.sha ||
        commit.parents.length !== 1 ||
        commit.parents[0]?.sha !== baseSha
      ) {
        throw new GitHubApiError('existing draft does not match the recorded base and ref');
      }
      return {
        repo,
        branch: `refs/heads/${head}`,
        number: existing.number,
        url: existing.html_url,
        headSha: existing.head.sha,
      };
    },
    async createBlob(repo, content) {
      return (await call(repo, 'POST', '/git/blobs', sha, { content, encoding: 'utf-8' })).sha;
    },
    async createTree(repo, baseTree, entries) {
      const tree = entries.map((e) => ({
        path: e.path,
        mode: e.mode ?? '100644',
        type: 'blob',
        sha: e.sha,
      }));
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
  };
}
