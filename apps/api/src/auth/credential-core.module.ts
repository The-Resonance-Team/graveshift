import { Global, Module } from '@nestjs/common';

import { CREDENTIAL_REPO, SENTRY_CREDENTIAL_VERIFIER } from './auth.types';
import { PrismaCredentialRepo } from './repo/credential.repo';
import { CredentialService } from './services/credential.service';

/** One issuer and store, shared by the credential routes and the MCP module. */
@Global()
@Module({
  providers: [
    CredentialService,
    { provide: CREDENTIAL_REPO, useClass: PrismaCredentialRepo },
    { provide: SENTRY_CREDENTIAL_VERIFIER, useExisting: CredentialService },
  ],
  exports: [CredentialService, CREDENTIAL_REPO, SENTRY_CREDENTIAL_VERIFIER],
})
export class CredentialCoreModule {}
