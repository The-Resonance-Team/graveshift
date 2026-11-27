import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const port = process.env.GRAVESHIFT_TEST_PG_PORT ?? '55438';
// Every apps/api/test/*.e2e.test.ts that gates on dbTestEnabled. Each one
// carries its own setup*Database hook; a new gated suite joins this list.
const DB_GATED_E2E = [
  'config-guard.e2e.test.ts',
  'config-secret.e2e.test.ts',
  'config.e2e.test.ts',
  'credentials.e2e.test.ts',
  'events-deployment.e2e.test.ts',
  'events.e2e.test.ts',
  'identity-security.e2e.test.ts',
  'identity.e2e.test.ts',
  'integrations-ingest.e2e.test.ts',
  'mcp-events.e2e.test.ts',
  'mcp-http.e2e.test.ts',
  'oauth.e2e.test.ts',
  'sentry-events.e2e.test.ts',
  'sentry-sdk.loopback.e2e.test.ts',
  'work-fix-scopes.e2e.test.ts',
  'work-items-audit.e2e.test.ts',
  'work-items-read-scope.e2e.test.ts',
  'work-items.e2e.test.ts',
] as const;
// The guard accepts only this named local throwaway database. One run id per
// invocation keeps parallel runs isolated and enables the opt-in DB tests.
const runId = randomBytes(16).toString('hex');
if (!/^\d{4,5}$/.test(port) || Number(port) > 65535) throw new Error('Invalid test database port');
const compose = [
  'docker',
  'compose',
  '-f',
  'deploy/compose/database-test.yml',
  '-p',
  `graveshift-tests-${process.pid}`,
];
const env = {
  ...process.env,
  GRAVESHIFT_TEST_PG_PORT: port,
  GRAVESHIFT_DB_TEST: '1',
  GRAVESHIFT_DB_TEST_ID: runId,
  // The isolated container is a local throwaway, not a CI database.
  CI: '',
  DATABASE_URL: `postgresql://gs_test:local-test-only@127.0.0.1:${port}/graveshift_test_${runId}`,
};
async function run(command: string[], cwd: string = root) {
  const child = Bun.spawn(command, { cwd, env, stdout: 'inherit', stderr: 'inherit' });
  const status = await child.exited;
  if (status !== 0)
    throw new Error(`Database check failed: ${command[0]} ${command[1] ?? ''} (${status})`);
}
try {
  await run([...compose, 'up', '-d', '--wait', '--wait-timeout', '40']);
  // prisma.config.ts lives in apps/api on this branch; run migrations from there.
  await run(['bun', 'x', '--no-install', 'prisma', 'migrate', 'deploy'], resolve(root, 'apps/api'));
  const suites = [
    './apps/api/test/database',
    './apps/api/src/actions',
    './apps/api/src/audit',
    './apps/api/src/hauntings',
    './apps/api/src/auth/repo',
    './apps/api/src/auth/services',
    './apps/api/src/deploys',
    './apps/api/src/fix',
    './apps/api/src/identity',
    './apps/api/src/mcp',
    './apps/api/src/work-items',
    './apps/daemon/src/platform.database.test.ts',
    './apps/daemon/src/observations.test.ts',
    './apps/daemon/src/observations.pending.test.ts',
    './apps/daemon/src/reads.test.ts',
    './apps/daemon/src/transport.test.ts',
    './apps/daemon/src/command-handler.test.ts',
    './apps/daemon/src/fix-audit.test.ts',
    './apps/daemon/src/lease.test.ts',
    './apps/daemon/src/model-context.test.ts',
    './apps/daemon/src/observations-database.test.ts',
    './apps/daemon/src/publication-failure.test.ts',
    './apps/daemon/src/recovery.test.ts',
    './apps/daemon/src/work-activation.test.ts',
    './apps/daemon/src/work-flow.test.ts',
    ...DB_GATED_E2E.map((name) => `./apps/api/test/${name}`),
  ];
  await run([
    'bun',
    'test',
    '--check',
    '--timeout',
    '30000',
    '--tsconfig-override',
    'apps/api/tsconfig.json',
    ...suites,
  ]);
} finally {
  await run([...compose, 'down', '--volumes', '--remove-orphans']);
}
