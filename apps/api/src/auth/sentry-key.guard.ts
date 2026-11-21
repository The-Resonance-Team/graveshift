import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  SENTRY_CREDENTIAL_VERIFIER,
  type CredentialVerifier,
  type VerifiedCredential,
} from './auth.types';
import type { SentryParamsDto } from './dto/sentry-params.dto';
import { EVENTS_PUBLISH_SCOPE } from './scopes';
import { sentryKeyCandidates, type SentryAuthRequest } from './sentry-auth';

interface SentryRequest extends SentryAuthRequest {
  params: SentryParamsDto;
  sentryPrincipal?: VerifiedCredential;
}

@Injectable()
export class SentryKeyGuard implements CanActivate {
  constructor(@Inject(SENTRY_CREDENTIAL_VERIFIER) private readonly verifier: CredentialVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SentryRequest>();
    const { keys, invalidDsn } = sentryKeyCandidates(request);
    const key = keys[0];
    if (
      invalidDsn ||
      !key ||
      keys.some((candidate) => candidate !== key) ||
      !/^[0-9a-f]{64}$/.test(key)
    ) {
      throw new ForbiddenException();
    }

    let credential: VerifiedCredential;
    try {
      credential = await this.verifier.verify(key, 'plugin');
    } catch {
      throw new ForbiddenException();
    }

    if (
      credential.kind !== 'plugin' ||
      credential.projectId !== request.params.projectId ||
      !credential.service ||
      !credential.tenantId ||
      credential.scopes.length !== 1 ||
      credential.scopes[0] !== EVENTS_PUBLISH_SCOPE
    ) {
      throw new ForbiddenException();
    }

    request.sentryPrincipal = credential;
    return true;
  }
}
