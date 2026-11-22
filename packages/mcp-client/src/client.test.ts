import { describe, expect, test } from 'bun:test';

import {
  GraveshiftMcpProtocolError,
  GraveshiftMcpToolError,
  GraveshiftMcpValidationError,
} from './errors';
import { FAKE_INCIDENT_ID, FAKE_SECRET, connectFakeInMemory } from './testing';

/**
 * One typed handle over the fake MCP server. The fake registers the same
 * primitives as `apps/api/src/mcp`; the drift test proves they match.
 */
describe('GraveshiftMcpClient (fake MCP server, in-memory transports)', () => {
  test('one client calls one tool and gets a typed result', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const services = await mcp.listServices();
      expect(services).toHaveLength(1);
      const first = services[0];
      expect(first?.name).toBe('api');
      expect(first?.status).toBe('healthy');
    } finally {
      await close();
    }
  });

  test('every tool wrapper returns its typed reply', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const incidents = await mcp.listIncidents({ limit: 2 });
      expect(incidents).toHaveLength(2);
      expect(incidents[0]?.incident.id).toBe(FAKE_INCIDENT_ID);

      const incident = await mcp.getIncident({ id: FAKE_INCIDENT_ID });
      expect(incident.category).toBe('code_bug');
      expect(incident.timeline?.[0]?.type).toBe('opened');

      const diagnosis = await mcp.getDiagnosis({ id: FAKE_INCIDENT_ID });
      expect(diagnosis.confidence).toBe(0.9);

      const audit = await mcp.getAuditLog({ afterSeq: 0, limit: 10 });
      expect(audit[0]?.seq).toBe(1);
      expect(audit[0]?.payload).toEqual({ service: 'api' });

      const chain = await mcp.verifyAuditChain();
      expect(chain).toEqual({ ok: true, length: 1 });

      const proposal = await mcp.proposeFix({ incidentId: FAKE_INCIDENT_ID, action: 'open_pr' });
      expect(proposal.executed).toBe(false);
      expect(proposal.decision.effect).toBe('allow');
      expect(proposal.decision.matchedRule).toBe('pr-code');
      expect(proposal.limits.enforced).toBe(true);
      expect(proposal.audit.actor).toBe('policy');

      const denied = await mcp.proposeFix({ incidentId: FAKE_INCIDENT_ID, action: 'restart' });
      expect(denied.decision.effect).toBe('deny');

      const logs = await mcp.tailLogs({ service: 'api', lines: 5 });
      expect(logs.startsWith('<untrusted_logs>')).toBe(true);
      expect(logs).toContain(FAKE_SECRET);

      const value = await mcp.queryMetric({ promql: 'up' });
      expect(value).toBe(1);
    } finally {
      await close();
    }
  });

  test('both prompts answer with typed messages', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const triage = await mcp.triageIncident({ incidentId: FAKE_INCIDENT_ID });
      expect(triage.messages[0]?.role).toBe('user');
      const triageText = triage.messages[0]?.content;
      expect(triageText?.type === 'text' && triageText.text).toContain('Triage incident inc1');

      const postmortemPrompt = await mcp.writePostmortem({ incidentId: FAKE_INCIDENT_ID });
      const secondText = postmortemPrompt.messages[0]?.content;
      expect(secondText?.type === 'text' && secondText.text).toContain('Write the Autopsy');
    } finally {
      await close();
    }
  });

  test('the postmortem resource returns the Autopsy markdown', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const markdown = await mcp.readPostmortem(FAKE_INCIDENT_ID);
      expect(markdown).toContain(`# Autopsy: api (${FAKE_INCIDENT_ID})`);
      expect(markdown).toContain('## Root cause');
    } finally {
      await close();
    }
  });

  test('raw list methods pass the SDK-typed catalog through', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const { tools } = await mcp.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        'list_services',
        'list_incidents',
        'get_incident',
        'get_diagnosis',
        'get_audit_log',
        'verify_audit_chain',
        'propose_fix',
        'tail_logs',
        'query_metric',
      ]);
      const { prompts } = await mcp.listPrompts();
      expect(prompts.map((prompt) => prompt.name)).toEqual(['triage_incident', 'write_postmortem']);
      const { resourceTemplates } = await mcp.listResourceTemplates();
      expect(resourceTemplates[0]?.uriTemplate).toBe('graveshift://incidents/{id}/postmortem');
    } finally {
      await close();
    }
  });

  test('a refusing tool raises GraveshiftMcpToolError, not a fault', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const error = await mcp.getIncident({ id: 'missing' }).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GraveshiftMcpToolError);
      expect((error as GraveshiftMcpToolError).tool).toBe('get_incident');
      expect((error as GraveshiftMcpToolError).text).toContain('not found');
      expect((error as GraveshiftMcpToolError).retryable).toBe(false);
    } finally {
      await close();
    }
  });

  test('a missing postmortem raises a protocol error', async () => {
    const { mcp, close } = await connectFakeInMemory();
    try {
      const error = await mcp.readPostmortem('nope').catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GraveshiftMcpProtocolError);
      expect(String((error as Error).message)).toContain('not found');
    } finally {
      await close();
    }
  });

  test('bad input fails locally before any server request', async () => {
    const { mcp, fake, close } = await connectFakeInMemory();
    try {
      const before = fake.requestCount();
      await expect(mcp.getIncident({ id: '' })).rejects.toBeInstanceOf(
        GraveshiftMcpValidationError,
      );
      await expect(mcp.listIncidents({ limit: 999 } as { limit: number })).rejects.toBeInstanceOf(
        GraveshiftMcpValidationError,
      );
      await expect(
        mcp.proposeFix({ incidentId: 'x', action: 'delete' as 'open_pr' }),
      ).rejects.toBeInstanceOf(GraveshiftMcpValidationError);
      await expect(
        mcp.triageIncident({ missing: true } as unknown as { incidentId: string }),
      ).rejects.toBeInstanceOf(GraveshiftMcpValidationError);
      expect(fake.requestCount()).toBe(before);
    } finally {
      await close();
    }
  });
});
