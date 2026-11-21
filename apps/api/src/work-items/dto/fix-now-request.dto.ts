import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

// A Fix now request may carry a short human note. It never grants permission.
export class FixNowRequestDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 500 })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}
