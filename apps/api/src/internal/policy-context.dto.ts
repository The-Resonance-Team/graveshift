import { IsString, MinLength, ValidateIf } from 'class-validator';

export class PolicyContextDto {
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  service!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  diagnosisRef?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  incidentId?: string;
}
