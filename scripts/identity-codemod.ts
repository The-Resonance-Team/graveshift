// Codemod for PR #121: replace boot project values in test constructors with the
// stored-grant test double. Run with --check to assert every expected occurrence.
import { readFileSync, writeFileSync } from 'node:fs';

const check = process.argv.includes('--check');

const workItemRepoFiles = [
  'apps/api/src/work-items/testing/work-db.fixture.ts',
  'apps/api/src/work-items/work-counter.database.spec.ts',
  'apps/api/src/work-items/work-item.database.spec.ts',
  'apps/api/src/work-items/work-question.database.spec.ts',
  'apps/api/src/work-items/work-routing.database.spec.ts',
  'apps/api/src/work-items/work-triage.database.spec.ts',
  'apps/daemon/src/platform-http.fixture.ts',
];

const ingressFiles = ['apps/api/src/work-items/work-ingress.database.spec.ts'];

function importPath(file: string): string {
  const depth = file.includes('apps/daemon/')
    ? '../../api/src/internal/testing/project-grant.fixture'
    : '../internal/testing/project-grant.fixture';
  // Fixtures in nested folders need a deeper relative path.
  if (file.endsWith('testing/work-db.fixture.ts'))
    return '../../internal/testing/project-grant.fixture';
  return depth;
}

function addImport(content: string, file: string): string {
  if (content.includes('project-grant.fixture')) return content;
  const lines = content.split('\n');
  let last = -1;
  lines.forEach((line, index) => {
    if (/^import .* from '.*';$/.test(line)) last = index;
  });
  if (last < 0) throw new Error(`No import line found in ${file}`);
  lines.splice(last + 1, 0, `import { testProjectGrant } from '${importPath(file)}';`);
  return lines.join('\n');
}

let failures = 0;
function rewrite(file: string, transform: (content: string) => { content: string; count: number }) {
  const before = readFileSync(file, 'utf8');
  const { content, count } = transform(before);
  if (check) {
    if (count > 0 || !before.includes('project-grant.fixture')) {
      failures += 1;
      console.error(`${file}: codemod is stale`);
    }
    return;
  }
  if (count === 0) {
    failures += 1;
    console.error(`${file}: expected at least one change, found none`);
    return;
  }
  const next = addImport(content, file);
  if (next !== before) writeFileSync(file, next);
}

const workItemPattern = /new WorkItemRepo\(([\s\S]*?), \{\s*projectId: ([^,\n}]+),?\s*\}\)/g;
for (const file of workItemRepoFiles) {
  rewrite(file, (content) => {
    let count = 0;
    const next = content.replace(workItemPattern, (_match, args: string, value: string) => {
      count += 1;
      return `new WorkItemRepo(${args}, testProjectGrant([${value.trim()}]))`;
    });
    return { content: next, count };
  });
}

const ingressPattern =
  /new WorkIngressService\(hauntings, fixture\.repo, \{\s*projectId: [^,]+,\s*agents: ([\s\S]*?),\s*\}\)/g;
for (const file of ingressFiles) {
  rewrite(file, (content) => {
    let count = 0;
    const next = content.replace(ingressPattern, (_match, agents: string) => {
      count += 1;
      return `new WorkIngressService(hauntings, fixture.repo, testProjectGrant(['project-1']), { agents: ${agents} })`;
    });
    return { content: next, count };
  });
}

if (failures > 0) {
  console.error(`identity codemod ${check ? 'check' : 'run'} failed: ${failures} file(s)`);
  process.exit(1);
}
process.stdout.write(`identity codemod ${check ? 'check' : 'run'} passed\n`);
