import 'reflect-metadata';
import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';

// Shared by bootstrap and tests that build the app through Test.createTestingModule().
export function configureApp<T extends INestApplication>(app: T): T {
  // Input endpoints attach a Zod schema with @Body({ schema }), @Query({ schema }) or @Param({ schema }).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  return app;
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  return configureApp(app);
}
