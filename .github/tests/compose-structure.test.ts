import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..', '..');
const compose = readFileSync(join(root, 'deploy', 'compose', 'graveshift.compose.yml'), 'utf8');
const dockerfile = readFileSync(join(root, 'deploy', 'compose', 'bun.Dockerfile'), 'utf8');

function serviceBlock(name: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) throw new Error(`Service ${name} is missing`);
  const end = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:\s*$/.test(line),
  );
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

describe('Compose actuator state', () => {
  test('the actuator sets ACTUATOR_STATE_DIR', () => {
    expect(serviceBlock('actuator')).toMatch(/^\s+ACTUATOR_STATE_DIR:\s*\S+/m);
  });

  test('the actuator mounts a writable persistent state volume', () => {
    const block = serviceBlock('actuator');
    expect(block).toContain('- actuator-state:/data/graveshift-actuator');
    expect(block).not.toMatch(/actuator-state:[^@\n]*:ro/);
  });

  test('the state volume is declared and is not tmpfs', () => {
    expect(compose).toMatch(/^volumes:\s*$/m);
    expect(compose).toMatch(/^\s{2}actuator-state:\s*$/m);
    expect(compose).not.toMatch(/tmpfs:[^\n]*graveshift-actuator/);
    // The inherited /tmp tmpfs stays; only the state path must be persistent.
    expect(compose).toMatch(/tmpfs: \[\/tmp\]/);
  });

  test('the image creates and owns the state directory before dropping privileges', () => {
    const stateDir = '/data/graveshift-actuator';
    const create = dockerfile
      .split('\n')
      .findIndex((line) =>
        new RegExp(`RUN\\s+mkdir -p ${stateDir.replaceAll('/', '\\/')}`).test(line),
      );
    expect(create).toBeGreaterThanOrEqual(0);
    expect(dockerfile.split('\n')[create]).toMatch(/chown\s+-R\s+bun:bun\s+\/data/);
    const userIndex = dockerfile.split('\n').findIndex((line) => line === 'USER bun');
    expect(userIndex).toBeGreaterThan(create);
  });
});
