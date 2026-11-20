import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GraveshiftMcpModule } from './mcp/mcp.module';
import { RulesController } from './rules.controller';

@Module({
  imports: [GraveshiftMcpModule],
  controllers: [HealthController, RulesController],
})
export class AppModule {}
