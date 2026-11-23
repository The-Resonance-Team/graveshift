import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class PublishEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ description: 'The project that owns the event.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  projectId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({ description: 'The Grave named by this event.' })
  @IsString()
  @IsNotEmpty()
  service!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/)
  type!: string;

  @ApiProperty({ enum: ['info', 'warning', 'critical'] })
  @IsIn(['info', 'warning', 'critical'])
  severity!: 'info' | 'warning' | 'critical';

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  observedAt!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  traceId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fingerprint!: string;

  @ApiPropertyOptional({ description: 'The deployed commit SHA, resolved by the server.' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{40}$/)
  deploymentId?: string | null;

  @ApiPropertyOptional({ description: 'The Organization-scoped Environment name.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  environment?: string | null;

  @ApiProperty({ type: Object, additionalProperties: true })
  @IsObject()
  payload!: Record<string, unknown>;
}
