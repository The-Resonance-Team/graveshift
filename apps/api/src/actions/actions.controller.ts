import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../internal/internal.guard';
import { ActionProjectError } from './action.errors';
import { ActionRepo } from './action.repo';
import { ClaimActionDto } from './dto/claim-action.dto';
import { CompleteActionDto } from './dto/complete-action.dto';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/actions')
export class InternalActionsController {
  constructor(private readonly actions: ActionRepo) {}

  @Post('claim')
  @HttpCode(200)
  async claim(@Body() input: ClaimActionDto) {
    try {
      return await this.actions.claim(input);
    } catch (error) {
      if (error instanceof ActionProjectError) throw new ForbiddenException(error.message);
      throw new ServiceUnavailableException({
        code: 'ACTION_STORAGE_UNAVAILABLE',
        message: 'Runtime admission is unavailable',
      });
    }
  }

  @Post('complete')
  @HttpCode(200)
  async complete(@Body() input: CompleteActionDto) {
    try {
      return await this.actions.complete(input);
    } catch (error) {
      if (error instanceof ActionProjectError) throw new ForbiddenException(error.message);
      throw new ServiceUnavailableException({
        code: 'ACTION_STORAGE_UNAVAILABLE',
        message: 'Runtime completion is unavailable',
      });
    }
  }
}
