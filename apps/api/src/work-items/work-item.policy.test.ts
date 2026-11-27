import { loadGraveshiftConfig } from '@graveshift/config';
import { describe, expect, test } from 'bun:test';

import { agentAssignee, type WorkItem } from '@graveshift/core';
import { assertFixEligible, decideTriage } from '@graveshift/work';

import { createWorkItemPolicy, gateAutoFix } from './work-item.policy';

describe('createWorkItemPolicy', () => {
  test('projects Agent names and the boot auto-fix flag from validated config', async () => {
    const config = await loadGraveshiftConfig();
    const policy = createWorkItemPolicy(config);
    expect(policy.agentNames).toContain('Exorcist');
    expect(policy.agentNames).toContain('SRE Agent');
    expect(policy.autoFixEnabled).toBe(config.fix.enabled);
  });

  test('applies a client Agent block by name without a merge', async () => {
    const config = await loadGraveshiftConfig();
    const override = structuredClone(config);
    override.agents.client = [
      {
        ...config.agents.system[0]!,
        name: 'Exorcist',
        role: 'custom-exorcist',
      },
    ];
    const policy = createWorkItemPolicy(override);
    expect(policy.agentNames).toHaveLength(config.agents.system.length);
    expect(policy.agentNames).toContain('Exorcist');
  });

  describe('gateAutoFix', () => {
    const agents = [
      { name: 'automatic', autoFix: true },
      { name: 'manual', autoFix: false },
    ] as unknown as Parameters<typeof gateAutoFix>[0];
    const item = {
      status: 'todo',
      draftPr: null,
      assignee: agentAssignee('automatic'),
    } as unknown as WorkItem;

    test('autoFix true with fix.enabled false starts no auto-fix and allows Fix now', () => {
      const gated = gateAutoFix(agents, false);
      expect(decideTriage(item, agentAssignee('automatic'), gated).trigger).toBeNull();
      expect(() => assertFixEligible(item, 'auto_fix', gated)).toThrow('Auto-fix is disabled');
      expect(assertFixEligible(item, 'fix_now', gated).name).toBe('automatic');
    });

    test('autoFix true with fix.enabled true starts auto-fix and rejects Fix now', () => {
      const gated = gateAutoFix(agents, true);
      expect(decideTriage(item, agentAssignee('automatic'), gated).trigger).toBe('auto_fix');
      expect(() => assertFixEligible(item, 'fix_now', gated)).toThrow('starts its fix from triage');
    });

    test('autoFix false stays off when fix.enabled is true', () => {
      const gated = gateAutoFix(agents, true);
      expect(decideTriage(item, agentAssignee('manual'), gated).trigger).toBeNull();
    });
  });
});
