import { Global, Module } from '@nestjs/common';

import { InternalGuard } from './internal.guard';
import { ProjectGrant } from './project-grant';

@Global()
@Module({ providers: [InternalGuard, ProjectGrant], exports: [InternalGuard, ProjectGrant] })
export class InternalAccessModule {}
