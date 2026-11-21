import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { PrincipalRequest } from '../auth.types';
import { CredentialService } from '../services/credential.service';
import { EVENTS_PUBLISH_SCOPE } from '../scopes';

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

    const principal = await this.credentials.verify(value, 'plugin');
    if (!principal.scopes.includes(EVENTS_PUBLISH_SCOPE)) throw new UnauthorizedException();
    request.pluginPrincipal = principal;
    return true;
  }
}
