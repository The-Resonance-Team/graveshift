import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { DeployAuthGuard } from './guards/deploy-auth.guard';

/** One global guard serves the deployment and environment controllers. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [DeployAuthGuard],
  exports: [DeployAuthGuard],
})
export class DeployAuthModule {}
