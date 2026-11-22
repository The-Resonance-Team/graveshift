import { describe, expect, test } from 'bun:test';

import { createGraveshiftMcp } from './client';
import { GraveshiftMcpToolError } from './errors';
import { fakeStdioTransport } from './testing';

/**
 * stdio transport coverage. The client spawns the fake MCP server script from
 * `src/fixtures` as a child process and talks over stdin/stdout, the same way
 * it would spawn the API stdio launcher `apps/api/src/stdio.ts`. No socket is
 * opened and no live endpoint is hit.
 */
describe('stdio transport (spawned fake server)', () => {
  test('a typed tool call travels over stdio', async () => {
    const mcp = createGraveshiftMcp({ ...fakeStdioTransport(), clientName: 'sdk-stdio-test' });
    try {
      const services = await mcp.listServices();
      expect(services).toEqual([{ name: 'api', status: 'healthy' }]);
      const proposal = await mcp.proposeFix({ incidentId: 'inc1', action: 'open_pr' });
      expect(proposal.decision.effect).toBe('allow');
      expect(proposal.executed).toBe(false);
    } finally {
      await mcp.close();
    }
  }, 30_000);

  test('prompts and the postmortem resource work over stdio too', async () => {
    const mcp = createGraveshiftMcp({ ...fakeStdioTransport(), clientName: 'sdk-stdio-test' });
    try {
      const prompt = await mcp.triageIncident({ incidentId: 'inc1' });
      const text = prompt.messages[0]?.content;
      expect(text?.type === 'text' && text.text).toContain('Triage incident inc1');
      const markdown = await mcp.readPostmortem('inc1');
      expect(markdown).toContain('# Autopsy: api (inc1)');
      await expect(mcp.getIncident({ id: 'missing' })).rejects.toBeInstanceOf(
        GraveshiftMcpToolError,
      );
    } finally {
      await mcp.close();
    }
  }, 30_000);
});
