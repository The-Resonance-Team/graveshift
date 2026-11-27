import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { PrincipalRequest } from './auth.types';
import { EVENTS_PUBLISH_SCOPE } from './scopes';
import { CredentialService } from './services/credential.service';

/** Checks the plugin bearer API key through the shared credential component. */
@Injectable()
export class PluginApiKeyGuard implements CanActivate {
  constructor(private readonly credentials: CredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PrincipalRequest & { headers?: { authorization?: string } }>();
    const header = request.headers?.authorization ?? '';
    const value = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!value) throw new UnauthorizedException('Bearer API key required');

    // Bad, expired, revoked and wrong-kind keys stay 401. A missing scope is 403.
    const principal =
      request.credentialPrincipal ?? (await this.credentials.verify(value, 'plugin'));
    if (principal.kind !== 'plugin') throw new UnauthorizedException();
    if (!principal.scopes.includes(EVENTS_PUBLISH_SCOPE)) throw new ForbiddenException();
    request.pluginPrincipal = principal;
    return true;
  }
}
