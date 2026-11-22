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

class RuntimeClaimDto implements claims.RuntimeClaim {
  @Allow()
  request!: claims.ActionRequest;

  @Allow()
  requestHash!: string;
}

export class ClaimActionDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => RuntimeClaimDto)
  @ValidateBy({
    name: 'runtimeClaim',
    validator: {
      validate: (value: unknown) => claims.RuntimeClaimSchema.safeParse(value).success,
      defaultMessage: () => 'claim must match the runtime claim contract',
    },
  })
  claim!: RuntimeClaimDto;
}
