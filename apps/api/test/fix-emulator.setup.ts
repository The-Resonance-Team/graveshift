// Bun-native equivalent of a Vitest setup file. The repo runs bun:test with a
// preload in bunfig.toml; this module installs the same beforeAll/afterEach/
// afterAll lifecycle. The emulators are local and stateful, never a real network.
import { afterAll, afterEach, beforeAll } from 'bun:test';
import { createEmulator, type Emulator } from 'emulate';

export const EMULATOR_URL_ENV = {
  github: 'GITHUB_EMULATOR_URL',
  ai: 'AI_EMULATOR_URL',
} as const;

const seedPath = new URL('./emulate.seed.yaml', import.meta.url);

export interface Emulators {
  urls: () => { github: string; ai: string };
  appPrivateKey: () => string;
}

/** Start github + ai emulators, reset after each test, close after the suite. */
export function useFixEmulators(): Emulators {
  let github: Emulator | undefined;
  let ai: Emulator | undefined;
  const originalUrls: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const seed: unknown = Bun.YAML.parse(await Bun.file(seedPath).text());
    [github, ai] = await Promise.all([
      createEmulator({
        service: 'github',
        port: 0,
        seed: { github: (seed as Record<string, unknown>).github },
      }),
      createEmulator({
        service: 'ai',
        port: 0,
        seed: { ai: (seed as Record<string, unknown>).ai },
      }),
    ]);
    originalUrls[EMULATOR_URL_ENV.github] = process.env[EMULATOR_URL_ENV.github];
    originalUrls[EMULATOR_URL_ENV.ai] = process.env[EMULATOR_URL_ENV.ai];
    process.env[EMULATOR_URL_ENV.github] = github.url;
    process.env[EMULATOR_URL_ENV.ai] = ai.url;
  });

  afterEach(async () => {
    await github?.reset();
    await ai?.reset();
  });

  afterAll(async () => {
    try {
      await Promise.all([github?.close(), ai?.close()]);
    } finally {
      for (const [name, original] of Object.entries(originalUrls)) {
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
      }
    }
  });

  return {
    urls: () => ({
      github: process.env[EMULATOR_URL_ENV.github] ?? '',
      ai: process.env[EMULATOR_URL_ENV.ai] ?? '',
    }),
    appPrivateKey: () => {
      const key = github?.generatedSecrets.find(
        (secret) => secret.kind === 'github.app_private_key' && secret.id === '12345',
      );
      if (key === undefined) throw new Error('emulator did not generate the GitHub App key');
      return key.value;
    },
  };
}

/** Rewrite the official API host to the emulator host. Config keeps HTTPS URLs. */
export function rewriteHost(target: string): typeof fetch {
  const base = new URL(target);
  const rewritten = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const source =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(source);
    url.protocol = base.protocol;
    url.host = base.host;
    return fetch(url, init);
  };
  // Adapter boundary: Bun extends fetch with preconnect, which the rewrite does not need.
  return rewritten as typeof fetch;
}

export const FIX_REPO = 'xiro/haunted-candy-shop';

const json = { 'content-type': 'application/json', authorization: 'Bearer emulator-test' };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`emulate github ${init?.method ?? 'GET'} ${url} -> ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Commit a file to the default branch through the contents API. */
export async function commitFile(
  githubUrl: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  await requestJson(`${githubUrl}/repos/${FIX_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({ message, content: Buffer.from(content, 'utf8').toString('base64') }),
  });
}

export interface RepoBase {
  readonly baseSha: string;
  readonly treeSha: string;
  readonly files: Readonly<Record<string, { blobSha: string; text: string | null }>>;
}

/** Read the real base ref, commit, recursive tree and blob text over the emulator. */
export async function readRepoBase(githubUrl: string, branch = 'main'): Promise<RepoBase> {
  const ref = await requestJson<{ object: { sha: string } }>(
    `${githubUrl}/repos/${FIX_REPO}/git/ref/heads/${branch}`,
  );
  const commit = await requestJson<{ tree: { sha: string } }>(
    `${githubUrl}/repos/${FIX_REPO}/git/commits/${ref.object.sha}`,
  );
  const tree = await requestJson<{ tree: Array<{ path: string; type: string; sha: string }> }>(
    `${githubUrl}/repos/${FIX_REPO}/git/trees/${commit.tree.sha}?recursive=1`,
  );
  // The tree is small in tests, so one batched read is the right shape here.
  const blobs = await Promise.all(
    tree.tree
      .filter((entry) => entry.type === 'blob')
      .map(async (entry) => {
        const blob = await requestJson<{ content: string; encoding: string }>(
          `${githubUrl}/repos/${FIX_REPO}/git/blobs/${entry.sha}`,
        );
        const bytes = Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8');
        return [
          entry.path,
          { blobSha: entry.sha, text: bytes.includes(0) ? null : bytes.toString('utf8') },
        ] as const;
      }),
  );
  return {
    baseSha: ref.object.sha,
    treeSha: commit.tree.sha,
    files: Object.fromEntries(blobs),
  };
}

/** Read the committed text of one path at one commit, through the real git objects. */
export async function readFileAtCommit(
  githubUrl: string,
  commitSha: string,
  path: string,
): Promise<string | null> {
  const commit = await requestJson<{ tree: { sha: string } }>(
    `${githubUrl}/repos/${FIX_REPO}/git/commits/${commitSha}`,
  );
  const tree = await requestJson<{ tree: Array<{ path: string; type: string; sha: string }> }>(
    `${githubUrl}/repos/${FIX_REPO}/git/trees/${commit.tree.sha}?recursive=1`,
  );
  const entry = tree.tree.find((candidate) => candidate.path === path && candidate.type === 'blob');
  if (entry === undefined) return null;
  const blob = await requestJson<{ content: string; encoding: string }>(
    `${githubUrl}/repos/${FIX_REPO}/git/blobs/${entry.sha}`,
  );
  return Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
}

export async function openPulls(githubUrl: string): Promise<Array<Record<string, unknown>>> {
  return requestJson(`${githubUrl}/repos/${FIX_REPO}/pulls`);
}

export async function pushedFixBranches(githubUrl: string): Promise<string[]> {
  const refs = await requestJson<Array<{ ref: string }>>(
    `${githubUrl}/repos/${FIX_REPO}/git/matching-refs/heads/graveshift`,
  );
  return refs.map((entry) => entry.ref);
}

/** Replace the AI rules with one canned reply object. Strict stays on. */
export async function setCannedReply(aiUrl: string, value: unknown): Promise<void> {
  await requestJson(`${aiUrl}/_ai/rules`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({
      strict: true,
      models: ['claude-sonnet-5.5'],
      rules: [{ id: 'fix-reply', reply: [{ type: 'object', value }] }],
    }),
  });
}

export async function aiCalls(aiUrl: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${aiUrl}/_ai/calls`);
  if (!response.ok) throw new Error(`emulate ai /_ai/calls -> ${response.status}`);
  return (await response.json()) as Array<Record<string, unknown>>;
}
