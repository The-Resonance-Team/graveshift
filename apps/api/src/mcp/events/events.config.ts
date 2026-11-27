import { Global, Module } from '@nestjs/common';

import { BOOT_CONFIG, type RootBootConfig } from '../../config/boot.config';

export const EVENTS_CONFIG = Symbol('EVENTS_CONFIG');

/** NATS settings for the read and write sides of the event stream. */
export interface EventsConfig {
  natsUrl?: string | undefined;
  stream: string;
}

@Global()
@Module({
  providers: [
    {
      provide: EVENTS_CONFIG,
      inject: [BOOT_CONFIG],
      useFactory: (config: RootBootConfig): EventsConfig => ({
        natsUrl: config.natsUrl,
        stream: config.natsStream,
      }),
    },
  ],
  exports: [EVENTS_CONFIG],
})
export class EventsConfigModule {}
