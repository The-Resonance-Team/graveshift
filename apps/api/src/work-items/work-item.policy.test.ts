import { loadGraveshiftConfig } from '@graveshift/config';
import { describe, expect, test } from 'bun:test';

import { createWorkItemPolicy } from './work-item.policy';

describe('createWorkItemPolicy', () => {
  test('projects Agent names and the boot auto-fix flag from validated config', async () => {
    const config = await loadGraveshiftConfig();
    const policy = createWorkItemPolicy(config);
    expect(policy.agentNames).toContain('Exorcist');
    expect(policy.agentNames).toContain('SRE Agent');
    expect(policy.autoFixEnabled).toBe(config.fix.enabled);
    expect(policy.clientConfig).toEqual({});
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
});
