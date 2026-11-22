import { Global, Module } from '@nestjs/common';

import { InternalGuard } from './internal.guard';

@Global()
@Module({ providers: [InternalGuard], exports: [InternalGuard] })
export class InternalAccessModule {}
