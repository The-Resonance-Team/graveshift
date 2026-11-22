import { IsArray, IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { CLIENT_ISSUABLE_SCOPES } from '../../auth/scopes';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMERIC_ID = /^\d{1,20}$/;

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class LoginDto extends RegisterDto {}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Matches(SLUG)
  @MaxLength(80)
  slug!: string;
}

export class OnboardingDto extends CreateOrganizationDto {}

export class OrgParamsDto {
  @IsString()
  @MinLength(1)
  orgId!: string;
}

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Matches(SLUG)
  @MaxLength(80)
  slug!: string;
}

export class AddMemberDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class CreateOAuthClientDto {
  @Matches(NUMERIC_ID)
  projectId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsIn(CLIENT_ISSUABLE_SCOPES, { each: true })
  scopes!: string[];
}
