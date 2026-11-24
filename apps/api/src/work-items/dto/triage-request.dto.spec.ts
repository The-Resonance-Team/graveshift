import 'reflect-metadata';
import { AGENT_ASSIGNEE_PREFIX, agentAssignee, parseAssignee } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TriageRequestDto } from './triage-request.dto';

const options = { whitelist: true, forbidNonWhitelisted: true };

const errorsFor = (assignee: string) =>
  validate(plainToInstance(TriageRequestDto, { assignee }), options);

describe('TriageRequestDto', () => {
  test('accepts the assignees the core seam produces', async () => {
    expect(await errorsFor('needs_human')).toHaveLength(0);
    expect(await errorsFor(agentAssignee('SRE Agent'))).toHaveLength(0);
  });

  test('rejects a bare prefix that the core seam also rejects', async () => {
    const bare = AGENT_ASSIGNEE_PREFIX;
    expect(parseAssignee(bare, ['SRE Agent']).ok).toBe(false);
    const errors = await errorsFor(bare);
    expect(errors.map((error) => error.property)).toContain('assignee');
  });

  test('rejects an assignee with no agent prefix', async () => {
    const errors = await errorsFor('unassigned');
    expect(errors.map((error) => error.property)).toContain('assignee');
  });
});
