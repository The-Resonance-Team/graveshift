import { type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';
import { CREDENTIAL_CONFIG, type AuthConfig, type VerifiedCredential } from './auth.types';
import { expandScopes, MANAGEMENT_SCOPE } from './scopes';
import { sentryKeyCandidates } from './sentry-auth';
import { CredentialService } from './services/credential.service';

export interface ThrottleRequest {
  headers?: { authorization?: string };
  query?: { sentry_key?: string | string[] };
  body?: unknown;
  ip?: string;
  method?: string;
  baseUrl?: string;
  route?: { path?: string };
  url?: string;
  credentialPrincipal?: VerifiedCredential;
}

interface OAuthPayload {
  sub?: string;
  projectId?: string;
  scope?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

/** Resolves the client id from a bearer token before the auth guards run. */
@Injectable()
export class ThrottleKeyGenerator {
  constructor(
    private readonly jwt: JwtService,
    private readonly credentials: CredentialService,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  async track(request: ThrottleRequest): Promise<string> {
    const header = request.headers?.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const sentryKeys = sentryKeyCandidates(request).keys;
    // A management JWT and an opaque credential are both accepted. Sentry keys
    // travel in the query, the envelope or the Sentry authorization scheme.
    const token = bearer || sentryKeys[0] || '';
    const anonymous = `ip:${request.ip ?? 'anonymous'}`;
    if (!token) return anonymous;

    try {
      return JSON.stringify(this.managementPrincipal(await this.verifyJwt(token)));
    } catch {
      // An issued credential is not a management JWT. Check it with the verifier.
    }
    try {
      const principal = await this.credentials.verify(token);
      request.credentialPrincipal = principal;
      return JSON.stringify(['client', principal.projectId, principal.clientId]);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      return anonymous;
    }
  }

  /**
   * Scope the bucket to the route as well as the caller. The typed tracker
   * resolves to the same value for one caller across routes, so without the
   * target prefix a public event request would consume the /api/credentials
   * bucket (and could turn an expected 401 into a 429).
   */
  generate(context: ExecutionContext, tracker: string): string {
    const target = `${context.getClass().name}.${context.getHandler().name}`;
    return `${target}:${tracker}`;
  }

  private async verifyJwt(token: string): Promise<OAuthPayload> {
    const payload = this.jwt.verify<OAuthPayload>(token, {
      secret: this.config.jwtSecret,
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
      algorithms: ['HS256'],
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload?.sub !== 'string' ||
      typeof payload.projectId !== 'string' ||
      !payload.sub ||
      !payload.projectId ||
      !Array.isArray(payload.scope) ||
      payload.iss !== this.config.jwtIssuer ||
      payload.aud !== this.config.jwtAudience ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now
    ) {
      throw new UnauthorizedException();
    }
    const client = await this.identity.findOAuthClient(payload.sub);
    if (client === undefined || client.projectId !== payload.projectId) {
      throw new UnauthorizedException();
    }
    if (!payload.scope.includes(MANAGEMENT_SCOPE)) throw new UnauthorizedException();
    const granted = new Set(expandScopes(client.scopes));
    if (!payload.scope.every((scope) => typeof scope === 'string' && granted.has(scope))) {
      throw new UnauthorizedException();
    }
    return payload;
  }

  private managementPrincipal(payload: OAuthPayload): [string, string, string] {
    const sub = payload.sub;
    const projectId = payload.projectId;
    if (!sub || !projectId) throw new UnauthorizedException();
    return ['client', projectId, sub];
  }
}
