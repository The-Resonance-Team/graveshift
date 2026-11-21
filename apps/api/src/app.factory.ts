import 'reflect-metadata';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Input endpoints attach a Zod schema with @Body({ schema }), @Query({ schema }) or @Param({ schema }).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  return app;
}
