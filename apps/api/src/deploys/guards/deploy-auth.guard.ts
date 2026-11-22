import {
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../../auth/auth.types';
import { verifyOAuthPrincipal, type OAuthPayload } from '../../auth/oauth-principal';
import { IDENTITY_REPO, type IdentityRepo } from '../../identity/identity.types';
import type { DeployPrincipal } from '../deploy.types';

export const DEPLOY_SCOPES = Symbol('DEPLOY_SCOPES');

/** Declares the scopes that allow one route. One of the named scopes is enough. */
export const RequireScopes = (...scopes: string[]) => SetMetadata(DEPLOY_SCOPES, scopes);

export interface DeployRequest {
  headers?: { authorization?: string };
  params?: { orgId?: string };
  deployPrincipal?: DeployPrincipal;
}

/** Reads the principal written by DeployAuthGuard after token verification. */
export const RequestDeployPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DeployPrincipal => {
    const request = context.switchToHttp().getRequest<DeployRequest>();
    if (request.deployPrincipal === undefined) throw new UnauthorizedException();
    return request.deployPrincipal;
  },
);

/**
 * Verifies the OAuth client bearer token, binds the request to the client's
 * Organization, and checks the scopes declared on the route. A request with no
 * token is refused before the identity store is read.
 */
@Injectable()
export class DeployAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeployRequest>();
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (token === '') throw new UnauthorizedException();

    let payload: OAuthPayload;
    try {
      payload = await this.jwt.verifyAsync<OAuthPayload>(token, {
        secret: this.config.jwtSecret,
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }

    const verified = await verifyOAuthPrincipal(payload, this.config, this.identity);
    const client = await this.identity.findOAuthClient(verified.clientId);
    if (client === undefined) throw new UnauthorizedException();

    if (request.params?.orgId !== undefined && request.params.orgId !== client.orgId) {
      throw new ForbiddenException('The Organization is not available to this client');
    }
    const required =
      this.reflector.getAllAndOverride<readonly string[]>(DEPLOY_SCOPES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length > 0 && !required.some((scope) => verified.scopes.includes(scope))) {
      throw new ForbiddenException('The client does not hold a scope for this route');
    }

    request.deployPrincipal = {
      clientId: verified.clientId,
      orgId: client.orgId,
      projectId: verified.projectId,
      scopes: verified.scopes,
    };
    return true;
  }
}
