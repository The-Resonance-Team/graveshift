import { loadGraveshiftConfig } from '@graveshift/config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { CREDENTIAL_CONFIG } from '../auth/auth.types';
import { BOOT_CONFIG, loadBootConfig, type RootBootConfig } from './boot.config';
import { freezeDeep, GRAVESHIFT_CONFIG } from './config.provider';
import { rootEnvSchema } from './env.schema';

// The merged config is loaded and validated once at boot. No route reads a file.
// The value is deep-frozen at load time: a route can never serve a mutated object.
@Global()
@Module({
  providers: [
    {
      provide: GRAVESHIFT_CONFIG,
      useFactory: async () => freezeDeep(await loadGraveshiftConfig()),
    },
  ],
  exports: [GRAVESHIFT_CONFIG],
})
export class GraveshiftConfigModule {}

// The boot config keeps the deployment-local facts (project, internal tokens,
// agents, policy and mode) that the committed Graveshift config does not hold.
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validationSchema: rootEnvSchema })],
  providers: [
    {
      provide: BOOT_CONFIG,
      inject: [ConfigService, GRAVESHIFT_CONFIG],
      useFactory: loadBootConfig,
    },
    {
      provide: CREDENTIAL_CONFIG,
      inject: [BOOT_CONFIG],
      useFactory: (config: RootBootConfig) => config.auth,
    },
  ],
  exports: [BOOT_CONFIG, CREDENTIAL_CONFIG],
})
export class RootConfigModule {}
