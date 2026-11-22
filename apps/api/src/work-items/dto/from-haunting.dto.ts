import { SUBJECT_TOKEN_PATTERN } from '@graveshift/core';
import type { FromHaunting } from '@graveshift/work';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class FromHauntingDto implements FromHaunting {
  @IsString()
  @Matches(SUBJECT_TOKEN_PATTERN)
  projectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  eventId!: string;

  @IsString()
  @MinLength(1)
  incidentId!: string;
}
