import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import type { PrincipalRequest } from '../auth/auth.types';
import { INCIDENTS_READ_SCOPE } from '../auth/scopes';

/**
 * Only a token that holds `incidents:read` may read Work items. The controller
 * guard admits the management surface with `tokens:manage`; this guard narrows
 * the three read routes further. A request with no verified principal fails
 * closed here too.
 */
@Injectable()
export class IncidentsReadScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const principal = context.switchToHttp().getRequest<Partial<PrincipalRequest>>().user;
    if (principal?.scopes?.includes(INCIDENTS_READ_SCOPE) !== true) {
      throw new ForbiddenException(`The token must hold ${INCIDENTS_READ_SCOPE}`);
    }
    return true;
  }
}
