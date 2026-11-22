// Shared harness for the fix-path e2e suite: the real use case with the real
// source read and sandbox, and the two local emulators as GitHub and the model.
import { createSubtasks, NEEDS_HUMAN, type WorkItem } from '@graveshift/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createSpawnRunner, type CommandRunner, jailWorks, networkJail } from '@graveshift/fixer';
import { GIT_EMPTY_BLOB_SHA } from '@graveshift/patch';
import { parsePolicy, type Policy } from '@graveshift/policy';
import request from 'supertest';
import { dirname } from 'node:path';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { createFixDeps } from '../src/fix/fix.deps';
import { FIX_DEPS, type FixDeps } from '../src/fix/fix.types';
import { WORK_ITEM_POLICY, type WorkItemPolicy } from '../src/work-items/work-item.policy';
import { WORK_ITEM_SEED, WorkItemStore } from '../src/work-items/work-item.store';
import {
  commitFile,
  readRepoBase,
  rewriteHost,
  setCannedReply,
  type Emulators,
  type RepoBase,
} from './fix-emulator.setup';

export const API_BEFORE = 'export const price = null;\nexport const total = () => price * 2;\n';
export const API_AFTER = 'export const price = 1;\nexport const total = () => price * 2;\n';
export { GIT_EMPTY_BLOB_SHA };

export const item: WorkItem = {
  id: 'wi-e2e',
  title: 'Fix the null price on api',
  description: 'The checkout totals a null price.',
  successCriteria: [],
  subtasks: createSubtasks([]),
  status: 'todo',
  priority: 'high',
  assignee: NEEDS_HUMAN,
  reporter: 'wraith',
  startDate: null,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: ['confidence:0.95', 'category:code_bug', 'signal:oom_killed'],
  team: 'sre',
  watchers: [],
  severity: 'critical',
  service: 'api',
  diagnosisRef: 'diag-e2e',
  fixPriority: 100,
  draftPr: null,
};

/**
 * The committed suite starts every check as a real subprocess through the
 * production spawn runner. A host that blocks user namespaces (GitHub-hosted
 * Ubuntu) has no jail that can start, so there the checks run without the jail
 * prefix. `packages/fixer/src/spawn.test.ts` holds the jail contract: the
 * argv prefix, the exact environment, the timeout kill and the fail-closed
 * default when no jail can run.
 */
async function sandboxRunner(): Promise<CommandRunner> {
  const jail = networkJail();
  const usable = await jailWorks(jail);
  // ponytail: no jail on a host that blocks user namespaces; upgrade when CI
  // gives the job an unprivileged jail, then drop the second branch
  return usable
    ? createSpawnRunner(jail ?? undefined)
    : createSpawnRunner(null, { requireJail: false });
}

const POLICY: WorkItemPolicy = { agentNames: ['Exorcist'], clientConfig: {}, autoFixEnabled: true };

function denyAllPolicy(base: Policy): Policy {
  return parsePolicy({ ...base, rules: [], default: 'deny' });
}

/** One real check command: it reads the applied file and fails when wrong. */
export function checkCommand(expected: string): string[] {
  return [
    process.execPath,
    '-e',
    `const t = require('node:fs').readFileSync('src/api.ts', 'utf8');` +
      `if (!t.includes(${JSON.stringify(expected)})) { console.error('patched text missing'); process.exit(1); }` +
      `for (const key of Object.keys(process.env)) {` +
      `  if (/KEY|TOKEN|SECRET|PASSWORD/.test(key)) { console.error('secret leaked: ' + key); process.exit(1); } }`,
  ];
}

export async function buildApp(deps: FixDeps, store: WorkItemStore): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WORK_ITEM_SEED)
    .useValue([])
    .overrideProvider(WorkItemStore)
    .useValue(store)
    .overrideProvider(WORK_ITEM_POLICY)
    .useValue(POLICY)
    .overrideProvider(FIX_DEPS)
    .useValue(deps)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

export interface Harness {
  readonly deps: FixDeps;
  readonly store: WorkItemStore;
  readonly reads: string[];
}

export async function harness(
  emu: Emulators,
  over: {
    commands?: string[][];
    commitAfterRead?: boolean;
    denyPolicy?: boolean;
    services?: string[];
  } = {},
): Promise<Harness> {
  const { loadGraveshiftConfig } = await import('@graveshift/config');
  const config = await loadGraveshiftConfig();
  const urls = emu.urls();
  const store = new WorkItemStore([structuredClone(item)]);
  const real = createFixDeps(config, {
    store,
    env: {
      ANTHROPIC_API_KEY: 'test-only-key',
      GRAVESHIFT_GITHUB_APP_ID: '12345',
      GRAVESHIFT_GITHUB_PRIVATE_KEY: emu.appPrivateKey(),
    },
    githubFetch: rewriteHost(urls.github),
    aiFetch: rewriteHost(urls.ai),
    now: () => new Date('2026-11-22T00:00:00.000Z'),
    sandboxRunner: await sandboxRunner(),
  });
  const reads: string[] = [];
  const source = {
    async readBase(repo: string, branch: string) {
      reads.push(`${repo}@${branch}`);
      const snapshot = await real.source.readBase(repo, branch);
      if (over.commitAfterRead) {
        await commitFile(urls.github, 'docs/late.md', '# late\n', 'late commit');
      }
      return snapshot;
    },
    currentBaseSha: (repo: string, branch: string) => real.source.currentBaseSha(repo, branch),
  };
  const deps: FixDeps = {
    ...real,
    source,
    repo: over.services === undefined ? real.repo : { ...real.repo, services: over.services },
    sandbox: {
      commands: over.commands?.map((argv) => [...argv]) ?? [checkCommand('')],
      timeoutMs: 60_000,
      // The owner-set runtime directory, exactly as graveshift.config.yaml does:
      // the host PATH is never inherited by a check.
      pathDirs: [dirname(process.execPath)],
    },
    ...(over.denyPolicy ? { policy: denyAllPolicy(real.policy) } : {}),
  };
  return { deps, store, reads };
}

/** Commit the seeded file and read back the real base, tree and blob SHAs. */
export async function seed(emu: Emulators): Promise<RepoBase> {
  const urls = emu.urls();
  await commitFile(urls.github, 'src/api.ts', API_BEFORE, 'add the price module');
  return readRepoBase(urls.github);
}

export function proposal(base: RepoBase): unknown {
  const file = base.files['src/api.ts'];
  if (file === undefined) throw new Error('the seeded file is missing from the base tree');
  return {
    baseSha: base.baseSha,
    files: [
      {
        path: 'src/api.ts',
        baseBlobSha: file.blobSha,
        diff: '@@ -1 +1 @@\n-export const price = null;\n+export const price = 1;\n',
        linesChanged: 1,
      },
    ],
  };
}

export async function fixNow(
  app: INestApplication,
  note?: string,
): Promise<Record<string, unknown>> {
  const response = await request(app.getHttpServer())
    .post('/api/work-items/wi-e2e/fix-now')
    .send(note === undefined ? {} : { note })
    .expect(200);
  return response.body as Record<string, unknown>;
}

export async function cannedFixReply(emu: Emulators, base: RepoBase): Promise<void> {
  await setCannedReply(emu.urls().ai, proposal(base));
}
