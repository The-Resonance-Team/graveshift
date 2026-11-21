import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';

import { ALL_SCOPES, type CredentialKind } from '../scopes';
import { NoMcpServiceConstraint } from './no-mcp-service.constraint';

export class CreateCredentialDto {
  @ApiProperty({ enum: ['mcp', 'plugin'] })
  @IsIn(['mcp', 'plugin'])
  @Validate(NoMcpServiceConstraint)
  kind!: CredentialKind;

  @ApiProperty({ description: 'A display name chosen by the client.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ALL_SCOPES, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(ALL_SCOPES, { each: true })
  scopes!: string[];

  @ApiPropertyOptional({
    description: 'Optional Grave or service binding. Plugin keys only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  service?: string;

  @ApiPropertyOptional({
    description: 'Lifetime in seconds. The config default applies when absent.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  ttlSeconds?: number;
}
