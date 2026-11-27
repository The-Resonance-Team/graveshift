import { Body, Controller, HttpCode, Post, UseFilters, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../../internal/internal.guard';
import { FromHauntingDto } from '../dto/from-haunting.dto';
import { WorkErrorFilter } from '../work-error.filter';
import { WorkIngressService } from '../work-ingress.service';

@ApiExcludeController()
@UseGuards(InternalGuard)
@UseFilters(WorkErrorFilter)
@Controller('internal/work-items')
export class WorkIngressController {
  constructor(private readonly ingress: WorkIngressService) {}

  @Post('from-haunting')
  @HttpCode(200)
  fromHaunting(@Body() body: FromHauntingDto) {
    return this.ingress.fromHaunting(body);
  }
}
