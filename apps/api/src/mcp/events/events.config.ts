import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
      inject: [ConfigService],
      useFactory: (config: ConfigService): EventsConfig => ({
        natsUrl: config.get<string>('GRAVESHIFT_NATS_URL'),
        stream: config.getOrThrow<string>('GRAVESHIFT_NATS_STREAM'),
      }),
    },
  ],
  exports: [EVENTS_CONFIG],
})
export class EventsConfigModule {}
