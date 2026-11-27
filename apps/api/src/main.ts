import type { GraveshiftConfig } from '@graveshift/config';

import { createApp } from './app.factory';
import { GRAVESHIFT_CONFIG } from './config/config.provider';
import { PrismaService } from './infra/prisma.service';
import { IdentityService } from './identity/services/identity.service';

async function bootstrap() {
  const app = await createApp();
  try {
    await app.get(PrismaService).$connect();
    await app.get(IdentityService).bootstrap();
    const config = app.get<GraveshiftConfig>(GRAVESHIFT_CONFIG);
    await app.listen(config.boot.port, config.boot.host);
  } catch (error) {
    await app.close();
    throw error;
  }
}

bootstrap().catch(() => {
  console.error('API startup failed');
  process.exit(1);
});
