import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { McpStdioLogger, McpStdioServer } from '@nestjs/mcp';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new McpStdioLogger(),
  });
  await app.get(McpStdioServer).listen();
  await app.close();
}

bootstrap().catch((error: unknown) => {
  console.error('MCP stdio startup failed', error);
  process.exit(1);
});
