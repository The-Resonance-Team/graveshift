import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { CREDENTIAL_CONFIG, type AuthConfig } from './auth.types';
import { sentryKeyCandidates } from './sentry-auth';
import { CredentialService } from './services/credential.service';

interface ThrottleRequest {
  headers?: { authorization?: string };
  query?: { sentry_key?: string | string[] };
  body?: unknown;
  ip?: string;
  method?: string;
  baseUrl?: string;
  route?: { path?: string };
  url?: string;
}

/** Resolves the client id from a bearer token before the auth guards run. */
@Injectable()
export class ThrottleKeyGenerator {
  constructor(
    private readonly jwt: JwtService,
    private readonly credentials: CredentialService,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
  ) {}

  generate(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<ThrottleRequest>();
    const route = `${request.method ?? 'UNKNOWN'}:${request.baseUrl ?? ''}${request.route?.path ?? request.url?.split('?')[0] ?? '/'}`;
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const sentryKeys = sentryKeyCandidates(request).keys;
    const presentedKey = sentryKeys[0] || token;
    if (!presentedKey) return `${request.ip ?? 'anonymous'}:${route}`;

    if (token) {
      try {
        const payload = this.jwt.verify<{ sub?: string; projectId?: string }>(token, {
          secret: this.config.jwtSecret,
          issuer: this.config.jwtIssuer,
          audience: this.config.jwtAudience,
          algorithms: ['HS256'],
        });
        if (payload.sub && payload.projectId) return `${payload.projectId}:${payload.sub}:${route}`;
      } catch {
        // An issued credential is not a management JWT. Check its hash index below.
      }
    }

    const known = this.credentials.clientIdForKey(presentedKey);
    // Unknown tokens share the caller's bucket. Rotating garbage must not
    // create unbounded buckets and cannot skip the request rate limit.
    return `${known ?? request.ip ?? 'anonymous'}:${route}`;
  }
}
