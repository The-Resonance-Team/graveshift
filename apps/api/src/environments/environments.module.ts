import { Module } from '@nestjs/common';

import { EnvironmentRepo } from './environment.repo';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsService } from './environments.service';

@Module({
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService, EnvironmentRepo],
  exports: [EnvironmentsService, EnvironmentRepo],
})
export class EnvironmentsModule {}
