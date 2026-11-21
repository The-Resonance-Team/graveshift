import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiAcceptedResponse,
  ApiForbiddenResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { eventAcceptedSchema } from '../auth.schema';
import type { PrincipalRequest } from '../auth.types';
import { PublishEventDto } from '../dto/publish-event.dto';
import { PluginApiKeyGuard } from '../guards/plugin-api-key.guard';
import { EventIngestService } from '../services/event-ingest.service';

@ApiTags('events')
@Controller('api/events')
export class EventsController {
  constructor(private readonly service: EventIngestService) {}

  @Post()
  @UseGuards(PluginApiKeyGuard, ThrottlerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'The envelope is accepted for publish.',
    standardSchema: eventAcceptedSchema,
  })
  @ApiUnauthorizedResponse({ description: 'The plugin API key is not valid.' })
  @ApiForbiddenResponse({ description: 'The scope, tenant or service binding failed.' })
  @ApiPayloadTooLargeResponse({ description: 'The envelope exceeds the size limit.' })
  @ApiTooManyRequestsResponse({ description: 'The key reached its request rate limit.' })
  @ApiUnprocessableEntityResponse({ description: 'The envelope is malformed.' })
  ingest(
    @Body() body: PublishEventDto,
    @Req() request: PrincipalRequest,
  ): Promise<{ accepted: true; id: string }> {
    if (!request.pluginPrincipal) throw new UnauthorizedException();
    return this.service.ingest(body, request.pluginPrincipal);
  }
}
