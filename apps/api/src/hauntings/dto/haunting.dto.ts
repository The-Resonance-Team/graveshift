import { ENVIRONMENT_PATTERN, SUBJECT_TOKEN_PATTERN } from '@graveshift/core';
import { RecordedHauntingSchema, type RecordedHaunting } from '@graveshift/core/recorded';
import {
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'recordedHaunting', async: false })
class RecordedHauntingConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return RecordedHauntingSchema.safeParse(value).success;
  }

  defaultMessage(): string {
    return 'view must match the recorded Haunting contract';
  }
}

export class HauntingProjectDto {
  @IsString()
  @Matches(SUBJECT_TOKEN_PATTERN)
  projectId!: string;
}

export class RecordHauntingDto extends HauntingProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  eventId!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(ENVIRONMENT_PATTERN)
  environment?: string | null;

  @IsObject()
  @Validate(RecordedHauntingConstraint)
  view!: RecordedHaunting;
}

export class ListHauntingsDto extends HauntingProjectDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GetHauntingDto extends HauntingProjectDto {
  @IsString()
  @MinLength(1)
  id!: string;
}

export class ActiveHauntingDto extends HauntingProjectDto {
  @IsString()
  @MinLength(1)
  service!: string;
}

export class HauntingContextDto extends ActiveHauntingDto {
  @IsString()
  @MinLength(1)
  diagnosisRef!: string;
}
