import 'reflect-metadata';
import { type INestApplication, HttpStatus, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi';

// Shared by bootstrap and tests that build the app through Test.createTestingModule().
export function configureApp<T extends INestApplication>(app: T): T {
  // Adapter boundary: the API uses Express to parse Sentry's raw envelope body.
  // Scope raw parsing to the envelope route so JSON routes keep their own parser.
  // A default Node SDK sends the envelope with no content type at all.
  const envelopePath = /^\/api\/[^/]+\/envelope\/?$/;
  (app as unknown as NestExpressApplication).useBodyParser('raw', {
    type: (req) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (!envelopePath.test(pathname)) return false;
      const value = req.headers['content-type'];
      return !value || /^(application\/x-sentry-envelope|text\/plain)/i.test(value);
    },
    limit: '1mb',
  });
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
  // The UI is a local development aid. In production it is not exposed as an extra
  // surface; the generated contract document stays available through the build step.
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  }
  return app;
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  return configureApp(app);
}
