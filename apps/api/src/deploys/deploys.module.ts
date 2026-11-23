import { Module } from '@nestjs/common';

import { DeploysController } from './deploys.controller';
import { DeployRepo } from './deploy.repo';
import { DeploysService } from './deploys.service';

@Module({
  controllers: [DeploysController],
  providers: [DeploysService, DeployRepo],
  exports: [DeploysService, DeployRepo],
})
export class DeploysModule {}
