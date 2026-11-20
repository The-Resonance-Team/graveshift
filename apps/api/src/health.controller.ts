import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { healthResponseSchema, type HealthResponse } from './health.schema.js';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('healthz')
  @ApiOkResponse({
    description: 'The API is ready.',
    standardSchema: healthResponseSchema,
  })
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
