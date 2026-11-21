import { Global, Module } from '@nestjs/common';

import { CREDENTIAL_REPO } from './auth.types';
import { PrismaCredentialRepo } from './repo/credential.repo';
import { CredentialService } from './services/credential.service';

/** One issuer and store, shared by the credential routes and the MCP module. */
@Global()
@Module({
  providers: [CredentialService, { provide: CREDENTIAL_REPO, useClass: PrismaCredentialRepo }],
  exports: [CredentialService, CREDENTIAL_REPO],
})
export class CredentialCoreModule {}
