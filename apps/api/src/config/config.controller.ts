import { AgentsFileSchema, type AgentsFile } from '@graveshift/agents';
import type { GraveshiftConfig } from '@graveshift/config';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PolicySchema, type Policy } from '@graveshift/policy';

import { GRAVESHIFT_CONFIG } from './config.provider';

// Read-only view of the config validated at boot (ADR 0015). No route reads a YAML
// file and there is no write route. The validated blocks hold no secret value:
// apiKeyEnv, appIdEnv and privateKeyEnv name environment variables, and the API
// never resolves them here. The dashboard is owned by another frontend engineer;
// this repo ships the contract and these endpoint definitions only.
@ApiTags('config')
@Controller('api/config')
export class ConfigController {
  constructor(@Inject(GRAVESHIFT_CONFIG) private readonly config: GraveshiftConfig) {}

  @Get('agents')
  @ApiOkResponse({
    description: 'The validated Agent config from boot. The client list overrides by name.',
    standardSchema: AgentsFileSchema,
  })
  getAgents(): AgentsFile {
    return this.config.agents;
  }

  @Get('policy')
  @ApiOkResponse({
    description: 'The validated policy config from boot. Default deny stays in force.',
    standardSchema: PolicySchema,
  })
  getPolicy(): Policy {
    return this.config.policy;
  }
}
