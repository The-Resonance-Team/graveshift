import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { PrincipalRequest } from '../auth/auth.types';
import { type HttpConfigScope } from '../auth/scopes';

export const CONFIG_SCOPE_KEY = 'graveshift:config-scope';

/** Declares the exact scope a config route serves. The guard runs before any parsing. */
export const RequiresScope = (scope: HttpConfigScope) => SetMetadata(CONFIG_SCOPE_KEY, scope);

/** Denies a bearer token that lacks the scope its route declares. Anonymous calls are
 * rejected earlier by the AuthGuard with 401, before any config value is read. */
@Injectable()
export class ConfigScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<HttpConfigScope | undefined>(
      CONFIG_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined) {
      throw new ForbiddenException('The config route declares no scope');
    }
    const user = context.switchToHttp().getRequest<PrincipalRequest>().user;
    if (!user || !user.scopes.includes(required)) {
      throw new ForbiddenException('The token does not hold the required config scope');
    }
    return true;
  }
}
