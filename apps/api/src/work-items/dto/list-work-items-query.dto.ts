import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_SEVERITIES,
  WORK_ITEM_STATUSES,
  type WorkItemPriority,
  type WorkItemSeverity,
  type WorkItemStatus,
} from '@graveshift/core';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';

const decimalInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;

export class ListWorkItemsQueryDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    default: 0,
    description: 'Decimal digits only.',
  })
  @Transform(decimalInteger, { toClassOnly: true })
  @IsInt()
  @Min(0)
  offset = 0;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Decimal digits only.',
  })
  @Transform(decimalInteger, { toClassOnly: true })
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: WORK_ITEM_STATUSES })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(WORK_ITEM_STATUSES)
  status?: WorkItemStatus;

  @ApiPropertyOptional({ enum: WORK_ITEM_PRIORITIES })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(WORK_ITEM_PRIORITIES)
  priority?: WorkItemPriority;

  @ApiPropertyOptional({ enum: WORK_ITEM_SEVERITIES })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(WORK_ITEM_SEVERITIES)
  severity?: WorkItemSeverity;

  @ApiPropertyOptional({ type: String })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  assignee?: string;

  @ApiPropertyOptional({ type: String })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  service?: string;
}
