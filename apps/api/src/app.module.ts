import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GraveshiftMcpModule } from './mcp/mcp.module';
import { RulesController } from './rules.controller';
import { WorkItemsModule } from './work-items/work-items.module';

@Module({
  imports: [GraveshiftMcpModule, WorkItemsModule],
  controllers: [HealthController, RulesController],
})
export class AppModule {}
