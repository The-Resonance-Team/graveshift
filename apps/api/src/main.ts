import { createApp } from './app.factory';

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
}

bootstrap().catch((error: unknown) => {
  console.error('API startup failed', error);
  process.exit(1);
});
