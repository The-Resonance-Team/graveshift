import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';

export const DAEMON_READ_CONFIG = Symbol('DAEMON_READ_CONFIG');

export interface DaemonReadConfig {
  baseUrl: string;
  token: string;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:2602';

/** The read token has no default: both services fail closed when it is absent. */
export const buildDaemonReadConfig = (
  env: Record<string, string | undefined>,
): DaemonReadConfig => {
  const token = env.GRAVESHIFT_DAEMON_READ_TOKEN;
  if (token === undefined || token.length === 0) {
    throw new Error('GRAVESHIFT_DAEMON_READ_TOKEN must be set');
  }
  const baseUrl = env.GRAVESHIFT_DAEMON_READ_URL || DEFAULT_BASE_URL;
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('GRAVESHIFT_DAEMON_READ_URL must be an HTTP URL');
  }
  return { baseUrl, token };
};

@Global()
@Module({
  providers: [
    {
      provide: DAEMON_READ_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DaemonReadConfig =>
        buildDaemonReadConfig({
          GRAVESHIFT_DAEMON_READ_URL: config.get<string>('GRAVESHIFT_DAEMON_READ_URL'),
          GRAVESHIFT_DAEMON_READ_TOKEN: config.get<string>('GRAVESHIFT_DAEMON_READ_TOKEN'),
        }),
    },
  ],
  exports: [DAEMON_READ_CONFIG],
})
export class DaemonReadConfigModule {}

/** One named, typed client for the daemon read surface. No other module calls the daemon. */
@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: 'daemon-read',
      inject: [DAEMON_READ_CONFIG],
      useFactory: (config: DaemonReadConfig) => ({
        baseUrl: config.baseUrl,
        headers: { authorization: `Bearer ${config.token}` },
        timeout: '2s',
        retry: false,
      }),
    }),
  ],
  exports: [HttpClientModule],
})
export class DaemonReadClientModule {}
