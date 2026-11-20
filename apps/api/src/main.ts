import { SwaggerModule } from '@nestjs/swagger';
import { createApp } from './app.factory.js';
import { createOpenApiDocument } from './openapi.js';

async function bootstrap() {
  const app = await createApp();
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
