import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { CLIENT_ISSUABLE_SCOPES } from '../../auth/scopes';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMERIC_ID = /^\d{1,20}$/;
const lowercaseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(lowercaseEmail, { toClassOnly: true })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 256 })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class LoginDto extends RegisterDto {}

export class CreateOrganizationDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ pattern: SLUG.source, maxLength: 80 })
  @Matches(SLUG)
  @MaxLength(80)
  slug!: string;
}

export class OnboardingDto extends CreateOrganizationDto {}

export class OrgParamsDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  orgId!: string;
}

export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ pattern: SLUG.source, maxLength: 80 })
  @Matches(SLUG)
  @MaxLength(80)
  slug!: string;
}

export class AddMemberDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(lowercaseEmail, { toClassOnly: true })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 256 })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class CreateOAuthClientDto {
  @ApiProperty({ pattern: NUMERIC_ID.source })
  @Matches(NUMERIC_ID)
  projectId!: string;

  @ApiProperty({ type: [String], enum: CLIENT_ISSUABLE_SCOPES, minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(CLIENT_ISSUABLE_SCOPES, { each: true })
  scopes!: string[];
}
