import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { CREDENTIAL_CONFIG, type AuthConfig } from './auth.types';
import { CredentialService } from './services/credential.service';

interface ThrottleRequest {
  headers?: { authorization?: string };
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
    if (!token) return `${request.ip ?? 'anonymous'}:${route}`;

    try {
      const payload = this.jwt.verify<{ sub?: string; tenantId?: string }>(token, {
        secret: this.config.jwtSecret,
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        algorithms: ['HS256'],
      });
      if (payload.sub && payload.tenantId) return `${payload.tenantId}:${payload.sub}:${route}`;
    } catch {
      // A plugin key is not a management JWT. Try the issued-key index below.
    }

    const known = this.credentials.clientIdForKey(token);
    // Unknown tokens share the caller's bucket. Rotating garbage must not
    // create unbounded buckets and cannot skip the request rate limit.
    return `${known ?? request.ip ?? 'anonymous'}:${route}`;
  }
}
