import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, test } from 'bun:test';

const stdioEntry = fileURLToPath(new URL('../src/stdio.ts', import.meta.url));
const apiDir = fileURLToPath(new URL('../', import.meta.url));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

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
