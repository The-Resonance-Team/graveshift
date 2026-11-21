import { Body, ConflictException, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { detectRuleOverrides } from '@graveshift/core';
import { z } from 'zod';

import { ValidateRulesDto } from './dto/validate-rules.dto';
import { validateRulesResponseSchema, type ValidateRulesResponse } from './rules.schema';

const conflictResponseSchema = z.object({
  overrideIds: z.array(z.string()),
  warning: z.string(),
});

@ApiTags('rules')
@Controller('api/rules')
export class RulesController {
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The rule set is accepted. No rule is stored.',
    standardSchema: validateRulesResponseSchema,
  })
  @ApiConflictResponse({
    description: 'The rule overrides are not confirmed.',
    standardSchema: conflictResponseSchema,
  })
  @ApiUnprocessableEntityResponse({ description: 'The request body is not valid.' })
  validate(@Body() body: ValidateRulesDto): ValidateRulesResponse {
    const { ids, warning } = detectRuleOverrides(body.systemRules, body.clientRules);
    if (ids.length > 0 && body.confirmOverrides !== true) {
      throw new ConflictException({ overrideIds: ids, warning });
    }
    return { accepted: true, overrideIds: ids, warning };
  }
}
