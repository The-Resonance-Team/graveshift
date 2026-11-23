import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from './internal.guard';
import { PolicyContextDto } from './policy-context.dto';
import { PolicyContextService } from './policy-context.service';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/context')
export class PolicyContextController {
  constructor(private readonly context: PolicyContextService) {}

  @Post()
  @HttpCode(200)
  resolve(@Body() input: PolicyContextDto) {
    return this.context.resolve(input);
  }
}
