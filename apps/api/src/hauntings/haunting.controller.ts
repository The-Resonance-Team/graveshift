import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../internal/internal.guard';
import {
  ActiveHauntingDto,
  GetHauntingDto,
  HauntingContextDto,
  ListHauntingsDto,
  RecordHauntingDto,
} from './dto/haunting.dto';
import { HauntingService } from './haunting.service';

interface JsonReply {
  status(code: number): JsonReply;
  json(value: unknown): void;
}

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/hauntings')
export class HauntingController {
  constructor(private readonly hauntings: HauntingService) {}

  @Post()
  @HttpCode(200)
  record(@Body() input: RecordHauntingDto) {
    return this.hauntings.record(input);
  }

  @Post('list')
  @HttpCode(200)
  list(@Body() input: ListHauntingsDto) {
    return this.hauntings.list(input);
  }

  @Post('get')
  @HttpCode(200)
  get(@Body() input: GetHauntingDto) {
    return this.hauntings.get(input);
  }

  @Post('context')
  @HttpCode(200)
  context(@Body() input: HauntingContextDto) {
    return this.hauntings.context(input);
  }

  @Post('active')
  @HttpCode(200)
  async active(@Body() input: ActiveHauntingDto, @Res() response: JsonReply): Promise<void> {
    // No active Haunting is `null` on the wire, not an empty body.
    response.status(200).json(await this.hauntings.active(input));
  }
}
