import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Principal, PrincipalRequest } from '../auth/auth.types';

// Route scope requirement. Each work-item route declares one scope with this decorator.
export const WORK_ITEM_SCOPE_KEY = 'workItems:scope';
export const RequireWorkItemScope = (scope: string) => SetMetadata(WORK_ITEM_SCOPE_KEY, scope);

// AuthGuard('oauth-client-credentials') puts the verified principal on request.user before
// this guard runs. The scope guard copies the actor and its ADR 0018 project id here, so a
// later audit write can scope every entry without a deployment-wide project id.
export interface WorkItemAuditScope {
  actor: string;
  projectId: string;
}

export interface WorkItemRequest extends PrincipalRequest {
  auditScope?: WorkItemAuditScope;
}

/** Enforces one exact scope per route. It never reads the store or a domain helper. */
@Injectable()
export class WorkItemScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(WORK_ITEM_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<WorkItemRequest>();
    const user: Principal | undefined = request.user;
    // An anonymous request is denied by passport with 401 before this guard runs.
    // A principal without the exact route scope is denied here with 403.
    if (user === undefined || required === undefined || !user.scopes.includes(required)) {
      throw new ForbiddenException();
    }
    request.auditScope = { actor: user.clientId, projectId: user.projectId };
    return true;
  }
}
