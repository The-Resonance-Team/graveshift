import 'reflect-metadata';
import { type INestApplication, HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';

// Shared by bootstrap and tests that build the app through Test.createTestingModule().
export function configureApp<T extends INestApplication>(app: T): T {
  // Request DTO classes own validation at the boundary. Undeclared fields are 422s.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  // Request DTOs carry explicit @ApiProperty metadata: this Bun API has no Nest CLI
  // compile step, so the Swagger classValidatorShim plugin never runs and rule #8
  // does not apply. The metadata keeps the generated contract request types intact.
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  return app;
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  return configureApp(app);
}
