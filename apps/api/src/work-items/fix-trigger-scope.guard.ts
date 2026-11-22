import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import type { PrincipalRequest } from '../auth/auth.types';
import { FIX_TRIGGER_SCOPE } from '../auth/scopes';

/**
 * Only a token that holds `fix:trigger` may start or resume a Fix attempt. The controller
 * guard already admits the management surface with `tokens:manage`; this guard narrows the
 * three Fix mutations further, so an operator must grant the trigger scope to an OAuth client
 * explicitly. The scope is in no credential kind and not in the console-issuable client set,
 * so a created Credential or a self-served client can never reach these routes. A request
 * with no verified principal fails closed here too.
 */
@Injectable()
export class FixTriggerScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const principal = context.switchToHttp().getRequest<Partial<PrincipalRequest>>().user;
    if (principal?.scopes?.includes(FIX_TRIGGER_SCOPE) !== true) {
      throw new ForbiddenException(`The token must hold ${FIX_TRIGGER_SCOPE}`);
    }
    return true;
  }
}
