import * as claims from '@graveshift/actuator/claims';
import { Type } from 'class-transformer';
import {
  Allow,
  IsDefined,
  IsNotEmpty,
  IsString,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

class RuntimeCompletionDto implements claims.RuntimeCompletion {
  @Allow()
  tokenId!: string;

  @Allow()
  actionId!: string;

  @Allow()
  requestHash!: string;

  @Allow()
  result!: claims.RuntimeOutcome;
}

export class CompleteActionDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => RuntimeCompletionDto)
  @ValidateBy({
    name: 'runtimeCompletion',
    validator: {
      validate: (value: unknown) => claims.RuntimeCompletionSchema.safeParse(value).success,
      defaultMessage: () => 'completion must match the runtime completion contract',
    },
  })
  completion!: RuntimeCompletionDto;
}
