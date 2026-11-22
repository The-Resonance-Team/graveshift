import { Module } from '@nestjs/common';

import { EnvironmentsModule } from '../environments/environments.module';
import { ReleasesModule } from '../releases/releases.module';
import { DeploysController } from './deploys.controller';
import { DeployRepo } from './deploy.repo';
import { DeploysService } from './deploys.service';

@Module({
  imports: [ReleasesModule, EnvironmentsModule],
  controllers: [DeploysController],
  providers: [DeploysService, DeployRepo],
  exports: [DeploysService, DeployRepo],
})
export class DeploysModule {}
