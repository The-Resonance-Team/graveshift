import { AGENT_ASSIGNEE_PREFIX, NEEDS_HUMAN } from '@graveshift/core';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

// Anchored on both ends: parseAssignee accepts needs_human or a needs_agent_ name only.
const ASSIGNEE_PATTERN = new RegExp(`^(?:${NEEDS_HUMAN}|${AGENT_ASSIGNEE_PREFIX}[\\s\\S]*)$`);

// parseAssignee in packages/core still checks the agent name against policy.
export class TriageRequestDto {
  @ApiProperty({
    anyOf: [
      { type: 'string', enum: [NEEDS_HUMAN] },
      { type: 'string', pattern: '^(needs_agent_)[\\s\\S]{0,}$' },
    ],
  })
  @IsString()
  @Matches(ASSIGNEE_PATTERN, { message: 'assignee must be needs_human or needs_agent_<name>' })
  assignee!: string;
}
