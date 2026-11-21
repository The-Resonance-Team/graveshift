import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// Query values arrive as strings. @Type coerces them; the initial values keep the old defaults.
export class ListWorkItemsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
