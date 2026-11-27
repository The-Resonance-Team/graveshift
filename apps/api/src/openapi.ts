import { API_CONTRACT_VERSION } from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Graveshift API')
    .setDescription('The only external surface of Graveshift.')
    .setVersion(API_CONTRACT_VERSION)
    // Bearer credentials from the shared OAuth issuer guard the config routes.
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
