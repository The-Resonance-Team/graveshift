import 'reflect-metadata';
import {
  HttpStatus,
  type INestApplication,
  StandardSchemaValidationPipe,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';

// Shared by bootstrap and tests that build the app through Test.createTestingModule().
export function configureApp<T extends INestApplication>(app: T): T {
  // DTO classes validate at the pipe with whitelist and 422 on unknown fields.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  // Older input endpoints attach a Zod schema with @Body({ schema }) or @Query({ schema }).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  return app;
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  return configureApp(app);
}
