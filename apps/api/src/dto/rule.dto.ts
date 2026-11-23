import {
  EVENT_SEVERITIES,
  RULE_ACTIONS,
  SUBJECT_TOKEN_PATTERN,
  SUBJECT_TYPE_PATTERN,
  type EventEnvelope,
  type RuleAction,
} from '@graveshift/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// The match filters mirror RuleMatchSchema in packages/core. Every filter is optional.
export class RuleMatchDto {
  @ApiPropertyOptional({ type: String, isArray: true, enum: EVENT_SEVERITIES })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsIn(EVENT_SEVERITIES, { each: true })
  severities?: EventEnvelope['severity'][];

  @ApiPropertyOptional({ type: String, isArray: true, minLength: 1 })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  services?: string[];

  @ApiPropertyOptional({ type: String, isArray: true, pattern: SUBJECT_TYPE_PATTERN.source })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @Matches(SUBJECT_TYPE_PATTERN, { each: true })
  types?: string[];

  @ApiPropertyOptional({ type: String, pattern: SUBJECT_TOKEN_PATTERN.source })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(SUBJECT_TOKEN_PATTERN)
  projectId?: string;
}

// A Rule on the wire. Its shape matches RuleSchema; validation stays at the boundary.
export class RuleDto {
  @ApiProperty({ type: String, minLength: 1 })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  priority!: number;

  @ApiProperty({ type: RuleMatchDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RuleMatchDto)
  match!: RuleMatchDto;

  @ApiProperty({ type: String, enum: RULE_ACTIONS })
  @IsIn(RULE_ACTIONS)
  action!: RuleAction;
}
