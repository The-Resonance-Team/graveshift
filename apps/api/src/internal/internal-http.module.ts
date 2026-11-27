import { Global, Module } from '@nestjs/common';
import { HttpClientModule } from '@nestjs/http-client';

import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';

@Global()
@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: 'daemon',
      imports: [],
      inject: [BOOT_CONFIG],
      useFactory: (config: RootBootConfig) => ({
        baseUrl: config.daemonUrl,
        headers: { authorization: `Bearer ${config.daemonInternalToken}` },
        retry: false,
        timeout: 300_000,
      }),
    }),
  ],
  exports: [HttpClientModule],
})
export class InternalHttpModule {}
