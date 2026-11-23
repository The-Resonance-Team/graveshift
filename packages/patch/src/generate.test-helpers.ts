import type { GatewayResult, GatewayTask } from '@graveshift/gateway';

import type { GeneratePatchOptions, PatchBase, PatchGateway } from './generate';
import type { PatchProposal, RepoRules } from './schemas';

// Shared fixtures for the two generate test files: the pinned base, the one
// valid diff proposal, and a fake gateway that records its tasks.

export const rules: RepoRules = {
  maxFilesChanged: 5,
  maxLinesChanged: 200,
  allowedPaths: ['src/**', 'config/**', 'test/**'],
  forbiddenPaths: ['.github/**', '**/*.pem', '**/.env*', 'deploy/**', 'policy*.yaml'],
};

export const base: PatchBase = {
  baseSha: 'base-sha',
  files: [
    { path: 'README.md', blobSha: 'blob-readme', text: '# haunted candy shop\n' },
    { path: 'src/a.ts', blobSha: 'blob-a', text: 'const price = null;\n' },
  ],
};

export const fixA: PatchProposal = {
  baseSha: 'base-sha',
  files: [
    {
      path: 'src/a.ts',
      baseBlobSha: 'blob-a',
      diff: '@@ -1 +1 @@\n-const price = null;\n+const price = 1;\n',
      linesChanged: 1,
    },
  ],
};

export const ok = (value: PatchProposal): GatewayResult<PatchProposal> => ({
  status: 'ok',
  value,
  model: 'test-model',
  usage: { in: 10, out: 5 },
  costUsd: 0,
});

export function fakeGateway(result: GatewayResult<PatchProposal>) {
  const tasks: GatewayTask<PatchProposal>[] = [];
  return {
    run: async (task: GatewayTask<PatchProposal>): Promise<GatewayResult<PatchProposal>> => {
      tasks.push(task);
      return result;
    },
    tasks,
  };
}

// The real system prompt is rendered from the config template by the fix path.
export const TEST_SYSTEM = 'Propose a guarded patch for the work item.';

export function options(gateway: PatchGateway, diagnosis = 'null price'): GeneratePatchOptions {
  return { gateway, agent: 'Exorcist', system: TEST_SYSTEM, rules, diagnosis, base };
}
