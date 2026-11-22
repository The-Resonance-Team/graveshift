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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  Validate,
} from 'class-validator';

import { CREDENTIAL_ISSUABLE_SCOPES, type CredentialKind } from '../scopes';
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

  // Only credential scopes are advertised and accepted here. The HTTP-only config
  // scopes are outside this list, so the document never offers a scope that issue denies.
  @ApiProperty({ enum: CREDENTIAL_ISSUABLE_SCOPES, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(CREDENTIAL_ISSUABLE_SCOPES, { each: true })
  scopes!: string[];

  @ApiPropertyOptional({
    description: 'Optional Grave or service binding. Plugin keys only.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/\S/, { message: 'service must not be blank' })
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
