import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';

import type { PrincipalRequest } from '../auth/auth.types';
import { isAuditScopeUsable, withAuditScope } from './audit.sink';

/**
 * Binds the authenticated audit scope (ADR 0018) for the whole handler. The scope is copied
 * from the verified OAuth principal the guard put on the request, so every audit entry a
 * request writes is keyed by that client's `projectId` and records that client as `actor`. An
 * unauthenticated request binds nothing: the use case then denies instead of writing an entry
 * into a chain nobody owns.
 */
@Injectable()
export class AuditScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const principal = context.switchToHttp().getRequest<Partial<PrincipalRequest>>().user;
    const scope =
      principal === undefined
        ? undefined
        : { projectId: principal.projectId, actor: principal.clientId };
    if (!isAuditScopeUsable(scope)) return next.handle();
    const bound = scope;
    return from(withAuditScope(bound, async () => await lastValueFrom(next.handle())));
  }
}
