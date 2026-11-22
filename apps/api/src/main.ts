import type { GraveshiftConfig } from '@graveshift/config';

import { createApp } from './app.factory';
import { GRAVESHIFT_CONFIG } from './config/config.provider';

async function bootstrap() {
  const app = await createApp();
  const config = app.get<GraveshiftConfig>(GRAVESHIFT_CONFIG);
  await app.listen(config.boot.port, config.boot.host);
}

bootstrap().catch((error: unknown) => {
  console.error('API startup failed', error);
  process.exit(1);
});
