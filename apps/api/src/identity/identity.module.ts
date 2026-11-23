import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AccountController } from './controllers/account.controller';
import { OrganizationsController } from './controllers/organizations.controller';
import { AccountAuthGuard } from './guards/account-auth.guard';
import { IDENTITY_REPO } from './identity.types';
import { PrismaIdentityRepo } from './repo/identity.repo';
import { IdentityService } from './services/identity.service';

/** Identity is global: account routes and the internal grant check share one store. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AccountController, OrganizationsController],
  providers: [
    IdentityService,
    AccountAuthGuard,
    { provide: IDENTITY_REPO, useClass: PrismaIdentityRepo },
  ],
  exports: [IdentityService, IDENTITY_REPO, AccountAuthGuard],
})
export class IdentityModule {}
