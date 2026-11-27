import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ValidateRulesDto } from './dto/validate-rules.dto';
import {
  rulesConflictSchema,
  validateRulesResponseSchema,
  type ValidateRulesResponse,
} from './rules.schema';
import { RulesService } from './rules.service';

@ApiTags('rules')
@Controller('api/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The rule set is accepted. No rule is stored.',
    standardSchema: validateRulesResponseSchema,
  })
  @ApiConflictResponse({
    description: 'The rule overrides are not confirmed.',
    standardSchema: rulesConflictSchema,
  })
  @ApiUnprocessableEntityResponse({ description: 'The request body is not valid.' })
  validate(@Body() body: ValidateRulesDto): ValidateRulesResponse {
    return this.rules.validate(body);
  }
}
