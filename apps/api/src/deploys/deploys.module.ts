import { Module } from '@nestjs/common';

import { DeploysController } from './deploys.controller';
import { DeploymentClosure } from './deployment-closure';
import { DeployRepo } from './deploy.repo';
import { DeploysService } from './deploys.service';

@Module({
  controllers: [DeploysController],
  providers: [DeploysService, DeployRepo, DeploymentClosure],
  exports: [DeploysService, DeployRepo, DeploymentClosure],
})
export class DeploysModule {}
