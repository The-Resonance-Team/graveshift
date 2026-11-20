// One-shot codemod: move all app ports into the 2600-2604 range.
// Run with --check first. Delete this script when the change merges.

import { readFileSync, writeFileSync } from 'node:fs';

type Replacement = { from: string; to: string; count: number };

const map: Record<string, Replacement[]> = {
  'examples/haunted-candy-shop/src/api-main.ts': [{ from: '?? 3000', to: '?? 2600', count: 1 }],
  'examples/haunted-candy-shop/src/worker-main.ts': [{ from: '?? 3001', to: '?? 2601', count: 1 }],
  'examples/haunted-candy-shop/Dockerfile': [
    { from: 'EXPOSE 3000 3001', to: 'EXPOSE 2600 2601', count: 1 },
  ],
  'deploy/compose/demo.compose.yml': [
    { from: '127.0.0.1:3000:3000', to: '127.0.0.1:2600:2600', count: 1 },
    { from: 'http://localhost:3000/healthz', to: 'http://localhost:2600/healthz', count: 1 },
    { from: "PORT: '3001'", to: "PORT: '2601'", count: 1 },
    { from: '127.0.0.1:3001:3001', to: '127.0.0.1:2601:2601', count: 1 },
  ],
  'deploy/compose/graveshift.compose.yml': [
    { from: 'http://api:3000', to: 'http://api:2600', count: 1 },
    { from: 'http://worker:3001', to: 'http://worker:2601', count: 1 },
    { from: 'http://actuator:3200', to: 'http://actuator:2603', count: 1 },
    { from: '127.0.0.1:3100:3000', to: '127.0.0.1:2602:2602', count: 1 },
    { from: 'http://localhost:3000/healthz', to: 'http://localhost:2602/healthz', count: 1 },
    { from: 'http://localhost:3200/healthz', to: 'http://localhost:2603/healthz', count: 1 },
  ],
  'deploy/compose/prometheus.yml': [
    { from: "api:3000'", to: "api:2600'", count: 1 },
    { from: "worker:3001'", to: "worker:2601'", count: 1 },
    { from: "graveshift:3000'", to: "graveshift:2602'", count: 1 },
  ],
  'apps/daemon/src/config.ts': [
    { from: 'env.PORT ?? 3000', to: 'env.PORT ?? 2602', count: 1 },
    { from: 'http://api:3000', to: 'http://api:2600', count: 1 },
    { from: 'http://worker:3001', to: 'http://worker:2601', count: 1 },
  ],
  'packages/actuator/src/main.ts': [{ from: 'env.PORT ?? 3200', to: 'env.PORT ?? 2603', count: 1 }],
  'apps/dashboard/next.config.ts': [
    { from: 'http://localhost:3100', to: 'http://localhost:2602', count: 1 },
  ],
  'apps/dashboard/package.json': [{ from: '-p 3300', to: '-p 2604', count: 2 }],
  'apps/daemon/src/daemon.test.ts': [
    { from: 'http://api:3000', to: 'http://api:2600', count: 2 },
    { from: 'http://worker:3001', to: 'http://worker:2601', count: 2 },
  ],
  'README.md': [
    { from: '127.0.0.1:3100', to: '127.0.0.1:2602', count: 3 },
    { from: 'localhost:3300', to: 'localhost:2604', count: 1 },
  ],
  'docs/DEMO.md': [
    { from: '127.0.0.1:3100', to: '127.0.0.1:2602', count: 2 },
    { from: 'localhost:3100', to: 'localhost:2602', count: 1 },
    { from: 'localhost:3300', to: 'localhost:2604', count: 1 },
    { from: 'localhost:3200', to: 'localhost:2603', count: 1 },
    { from: 'localhost:3000', to: 'localhost:2600', count: 2 },
    { from: 'port 3000', to: 'port 2600', count: 2 },
    { from: 'ports 3000 and 3001', to: 'ports 2600 and 2601', count: 1 },
    { from: 'port 3001', to: 'port 2601', count: 2 },
    { from: 'localhost:3001', to: 'localhost:2601', count: 1 },
  ],
  'docs/ARCHITECTURE.md': [
    { from: '127.0.0.1:3100', to: '127.0.0.1:2602', count: 1 },
    { from: 'port 3200', to: 'port 2603', count: 1 },
  ],
  'docs/qa/coverage-matrix.md': [{ from: 'localhost:3300', to: 'localhost:2604', count: 21 }],
  'docs/HANDOFF.md': [
    { from: 'Host port 3000 is occupied', to: 'Demo API port 2600 may be occupied', count: 1 },
  ],
};

const checkOnly = process.argv.includes('--check');
let failures = 0;
let changed = 0;

for (const [path, replacements] of Object.entries(map)) {
  let text = readFileSync(path, 'utf8');
  const original = text;
  for (const { from, to, count } of replacements) {
    const found = text.split(from).length - 1;
    if (found !== count) {
      console.error(`${path}: ${JSON.stringify(from)} expected ${count}, found ${found}`);
      failures += 1;
      continue;
    }
    text = text.replaceAll(from, to);
  }
  if (!checkOnly && text !== original) {
    writeFileSync(path, text);
    changed += 1;
  }
}

const summary = `${checkOnly ? 'checked' : 'changed'} ${Object.keys(map).length} files, failures=${failures}\n`;
process.stdout.write(summary);
if (failures > 0) process.exit(1);
if (!checkOnly) process.stdout.write(`wrote ${changed} files\n`);
