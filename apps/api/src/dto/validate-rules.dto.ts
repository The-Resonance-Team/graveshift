import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  Validate,
  ValidateNested,
} from 'class-validator';

import { UniqueRuleIdsConstraint } from '../common/validators/unique-rule-ids.validator';
import { RuleDto } from './rule.dto';

// Bound request size until authentication ships.
export const MAX_RULES_PER_LAYER = 200;

// One layer of rules. Both layers use this shape; ValidateRulesDto composes them.
export class RulesLayerDto {
  @ApiProperty({ type: RuleDto, isArray: true, maxItems: MAX_RULES_PER_LAYER })
  @IsArray()
  @ArrayMaxSize(MAX_RULES_PER_LAYER)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  @Validate(UniqueRuleIdsConstraint)
  systemRules!: RuleDto[];

  @ApiProperty({ type: RuleDto, isArray: true, maxItems: MAX_RULES_PER_LAYER })
  @IsArray()
  @ArrayMaxSize(MAX_RULES_PER_LAYER)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  @Validate(UniqueRuleIdsConstraint)
  clientRules!: RuleDto[];
}

export class ValidateRulesDto extends RulesLayerDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  confirmOverrides?: boolean;
}
