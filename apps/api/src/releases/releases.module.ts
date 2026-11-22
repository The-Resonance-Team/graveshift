import { Module } from '@nestjs/common';

import { ReleasesController } from './releases.controller';
import { ReleaseRepo } from './release.repo';
import { ReleasesService } from './releases.service';

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService, ReleaseRepo],
  exports: [ReleasesService, ReleaseRepo],
})
export class ReleasesModule {}
