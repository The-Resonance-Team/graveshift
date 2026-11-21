import {
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  type ArgumentsHost,
  HttpException,
  Inject,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiForbiddenResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { CREDENTIAL_CONFIG, type AuthConfig, type VerifiedCredential } from '../auth.types';
import { SentryParamsDto } from '../dto/sentry-params.dto';
import { SentryKeyGuard } from '../sentry-key.guard';
import { SentryIngestService } from '../services/sentry-ingest.service';

interface SentryRequest {
  sentryPrincipal?: VerifiedCredential;
}

@Catch(HttpException)
export class SentryHttpExceptionFilter implements ExceptionFilter<HttpException> {
  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
      status(code: number): { json(body: unknown): void };
    }>();
    const status = exception.getStatus();
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      response.setHeader('Retry-After', String(Math.ceil(this.config.eventRateTtlMs / 1000)));
    }
    response.status(status).json(exception.getResponse());
  }
}

@ApiTags('events')
@Controller('api/:projectId/envelope')
export class SentryEventsController {
  constructor(private readonly service: SentryIngestService) {}

  @Post()
  @UseGuards(ThrottlerGuard, SentryKeyGuard)
  @UseFilters(SentryHttpExceptionFilter)
  @ApiConsumes('application/x-sentry-envelope')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The Sentry event is accepted.',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  })
  @ApiForbiddenResponse({ description: 'The key, project, scope or binding is invalid.' })
  @ApiPayloadTooLargeResponse({ description: 'The envelope or event item exceeds one MiB.' })
  @ApiTooManyRequestsResponse({ description: 'The Sentry key reached its request rate limit.' })
  @ApiUnprocessableEntityResponse({ description: 'The Sentry envelope or event is malformed.' })
  async ingest(
    @Param() params: SentryParamsDto,
    @Body() body: unknown,
    @Req() request: SentryRequest,
  ): Promise<{ id: string }> {
    if (!Buffer.isBuffer(body) || !request.sentryPrincipal) {
      throw new UnprocessableEntityException('Malformed Sentry envelope');
    }
    return this.service.ingest(params, body, request.sentryPrincipal);
  }
}
