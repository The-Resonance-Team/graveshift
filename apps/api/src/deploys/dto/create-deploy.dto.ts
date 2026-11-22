import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const NUMERIC_ID = /^\d{1,20}$/;

export class CreateDeployDto {
  @ApiProperty({ example: 'release-1' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  releaseId!: string;

  @ApiProperty({ description: 'The Organization-scoped Environment name.', example: 'production' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  environment!: string;

  @ApiProperty({ example: 'deploy-2026-11-22' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '2026-11-22T07:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  dateStarted!: Date;

  @ApiPropertyOptional({ example: '2026-11-22T07:05:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFinished?: Date;

  @ApiPropertyOptional({ example: 'https://ci.example.test/runs/42' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Project ids to target. All Release Projects are used when absent.',
    example: ['1001'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(NUMERIC_ID, { each: true })
  projects?: string[];
}
