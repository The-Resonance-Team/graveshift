import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import type { OAuthAccessRequest } from './oauth-client-access.strategy';

export const OAUTH_ROUTE_SCOPE_KEY = 'oauth:routeScope';

// A work-item route declares no extra scope here. Its own WorkItemScopeGuard enforces
// the per-route scope after this guard verifies the bearer token.
export const NoOAuthScopeRequirement = () => SetMetadata(OAUTH_ROUTE_SCOPE_KEY, null);

/**
 * The oauth-client-access auth guard with route scope metadata. The default in the
 * strategy stays config:export, so the config endpoint needs no change and no second
 * strategy name exists.
 */
@Injectable()
export class OAuthClientAccessGuard extends AuthGuard('oauth-client-access') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<string | null | undefined>(
      OAUTH_ROUTE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<OAuthAccessRequest>();
    request.oauthRequiredScope = requirement === undefined ? undefined : requirement;
    return super.canActivate(context);
  }
}
