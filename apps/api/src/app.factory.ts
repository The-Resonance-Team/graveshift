import 'reflect-metadata';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Input endpoints attach a Zod schema with @Body({ schema }), @Query({ schema }) or @Param({ schema }).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  return app;
}
