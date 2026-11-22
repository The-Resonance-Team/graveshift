import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, test } from 'bun:test';

const stdioEntry = fileURLToPath(new URL('../src/stdio.ts', import.meta.url));
const apiDir = fileURLToPath(new URL('../', import.meta.url));
// Forward only PATH and the test-only boot vars from `test/setup.ts`. A CI
// runner exports many host variables; forwarding all of them can break the
// launcher, and none of them belongs in a child smoke-test process.
const env: Record<string, string> = {};
for (const name of [
  'PATH',
  'DATABASE_URL',
  'GRAVESHIFT_PROJECT_ID',
  'GRAVESHIFT_API_INTERNAL_TOKEN',
  'GRAVESHIFT_DAEMON_INTERNAL_TOKEN',
  'GRAVESHIFT_OAUTH_JWT_SECRET',
  'GRAVESHIFT_OAUTH_CLIENTS',
  'GRAVESHIFT_DAEMON_READ_TOKEN',
] as const) {
  const value = process.env[name];
  if (value !== undefined) env[name] = value;
}

describe('stdio launcher (e2e)', () => {
  test('answers a 2025-06-18 initialize handshake', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [stdioEntry],
      cwd: apiDir,
      env,
      stderr: 'ignore',
    });
    const client = new Client({ name: 'stdio-smoke', version: '1.0.0' });
    try {
      // A legacy handshake is the 2025-06-18 protocol revision.
      await client.connect(transport, { prior: { kind: 'legacy' } });
      expect(client.getProtocolEra()).toBe('legacy');
      expect(client.getServerVersion()).toMatchObject({ name: 'graveshift-mcp', version: '0.1.0' });
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain('list_services');
    } finally {
      await client.close();
    }
  }, 20000);
});
