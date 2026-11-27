import { AGENT_ASSIGNEE_PREFIX, AssigneeSchema, NEEDS_HUMAN } from '@graveshift/core';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { WorkValue } from './work-value';

export class TriageRequestDto {
  @ApiProperty({
    anyOf: [
      { type: 'string', enum: [NEEDS_HUMAN] },
      { type: 'string', pattern: `^(${AGENT_ASSIGNEE_PREFIX})[\\s\\S]{1,}$` },
    ],
  })
  @IsString()
  // The format comes from core's one assignee seam, not a second regex in this DTO.
  @WorkValue(AssigneeSchema)
  assignee!: string;
}
