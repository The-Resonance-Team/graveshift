import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { InternalGuard } from './internal.guard';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/config')
export class InternalConfigController {
  constructor(@Inject(BOOT_CONFIG) private readonly config: RootBootConfig) {}

  @Get()
  read() {
    return {
      projectId: this.config.projectId,
      agents: this.config.agents,
      policy: this.config.policy,
      gateway: this.config.gateway,
      natsStream: this.config.natsStream,
      ...(this.config.mode === undefined ? {} : { mode: this.config.mode }),
    };
  }
}
