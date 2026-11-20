import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RulesController } from './rules.controller';

@Module({
  controllers: [HealthController, RulesController],
})
export class AppModule {}
