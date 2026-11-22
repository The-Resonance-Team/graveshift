import { confirmRuleOverrides } from '@graveshift/core';
import { ConflictException, Injectable } from '@nestjs/common';

import type { ValidateRulesDto } from './dto/validate-rules.dto';
import type { ValidateRulesResponse } from './rules.schema';

@Injectable()
export class RulesService {
  validate(input: ValidateRulesDto): ValidateRulesResponse {
    const result = confirmRuleOverrides(input);
    const { overrideIds, warning } = result;
    if (!result.accepted) throw new ConflictException({ overrideIds, warning });
    return { accepted: true, overrideIds, warning };
  }
}
