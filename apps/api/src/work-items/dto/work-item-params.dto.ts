import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

// Route params ride one @Param() object. Decorate the id so whitelist keeps it.
export class WorkItemParamsDto {
  @ApiProperty({ type: String, minLength: 1 })
  @IsString()
  @MinLength(1)
  id!: string;
}
