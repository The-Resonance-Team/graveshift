import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { DEFAULT_DAEMON_GRANT, IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';
import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { InternalGuard } from './internal.guard';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/config')
export class InternalConfigController {
  constructor(
    @Inject(BOOT_CONFIG) private readonly config: RootBootConfig,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  @Get()
  async read() {
    const grant = await this.identity.findGrant(DEFAULT_DAEMON_GRANT);
    return {
      projectIds: grant?.projectIds ?? [],
      agents: this.config.agents,
      policy: this.config.policy,
      gateway: this.config.gateway,
      natsStream: this.config.natsStream,
      ...(this.config.mode === undefined ? {} : { mode: this.config.mode }),
    };
  }
}
