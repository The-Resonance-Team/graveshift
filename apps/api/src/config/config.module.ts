import { loadGraveshiftConfig } from '@graveshift/config';
import { Global, Module } from '@nestjs/common';

import { freezeDeep, GRAVESHIFT_CONFIG } from './config.provider';

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
