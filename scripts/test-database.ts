import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const port = process.env.GRAVESHIFT_TEST_PG_PORT ?? '55438';
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
const baseEnv = {
  ...process.env,
  GRAVESHIFT_TEST_PG_PORT: port,
  GRAVESHIFT_DB_TEST: '1',
  GRAVESHIFT_DB_TEST_ID: runId,
  // The isolated container is a local throwaway, not a CI database.
  CI: '',
  DATABASE_URL: `postgresql://gs_test:local-test-only@127.0.0.1:${port}/graveshift_test_${runId}`,
};
// The v3 deploy database rules use the isolated fixture guard. They get one
// private database per run, so they cannot touch the shared migration database.
const runId = randomBytes(16).toString('hex');
const isolatedDatabase = `graveshift_test_${runId}`;
const isolatedEnv = {
  ...baseEnv,
  GRAVESHIFT_DB_TEST: '1',
  GRAVESHIFT_DB_TEST_ID: runId,
  DATABASE_URL: `postgresql://gs_test:local-test-only@127.0.0.1:${port}/${isolatedDatabase}`,
};
async function run(command: string[], cwd: string = root, env: NodeJS.ProcessEnv = baseEnv) {
  const child = Bun.spawn(command, { cwd, env, stdout: 'inherit', stderr: 'inherit' });
  const status = await child.exited;
  if (status !== 0)
    throw new Error(`Database check failed: ${command[0]} ${command[1] ?? ''} (${status})`);
}
try {
  await run([...compose, 'up', '-d', '--wait', '--wait-timeout', '40']);
  // prisma.config.ts lives in apps/api on this branch; run migrations from there.
  await run(['bun', 'x', '--no-install', 'prisma', 'migrate', 'deploy'], resolve(root, 'apps/api'));
  await run([
    'bun',
    'test',
    '--check',
    '--timeout',
    '30000',
    '--tsconfig-override',
    'apps/api/tsconfig.json',
    './apps/api/test/database',
    './apps/api/src/actions',
    './apps/api/src/audit',
    './apps/api/src/hauntings',
    './apps/api/src/auth/repo',
    './apps/api/src/work-items',
    './apps/daemon/src/platform.database.test.ts',
  ]);

  await run([
    ...compose,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'graveshift_test',
    '-d',
    'graveshift_test',
    '-c',
    `CREATE ROLE gs_test LOGIN PASSWORD 'local-test-only'`,
  ]);
  await run([
    ...compose,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'graveshift_test',
    '-d',
    'graveshift_test',
    '-c',
    `CREATE DATABASE "${isolatedDatabase}" OWNER gs_test`,
  ]);
  await run(
    ['bun', 'x', '--no-install', 'prisma', 'migrate', 'deploy'],
    resolve(root, 'apps/api'),
    isolatedEnv,
  );
  await run(
    [
      'bun',
      'test',
      '--check',
      '--timeout',
      '30000',
      '--tsconfig-override',
      'apps/api/tsconfig.json',
      './apps/api/test/database/deploys.db.test.ts',
    ],
    root,
    isolatedEnv,
  );
} finally {
  await run([...compose, 'down', '--volumes', '--remove-orphans']);
}
