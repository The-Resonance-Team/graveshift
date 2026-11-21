import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Infrastructure only. Feature services use flat domain-verb repos added later. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaInfraModule {}
