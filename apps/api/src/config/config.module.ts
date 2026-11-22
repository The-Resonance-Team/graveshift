import { loadGraveshiftConfig } from '@graveshift/config';
import { Global, Module } from '@nestjs/common';

import { GRAVESHIFT_CONFIG } from './config.provider';

// The merged config is loaded and validated once at boot. No route reads a file.
@Global()
@Module({
  providers: [{ provide: GRAVESHIFT_CONFIG, useFactory: loadGraveshiftConfig }],
  exports: [GRAVESHIFT_CONFIG],
})
export class GraveshiftConfigModule {}
