import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Feature services access durable state through their domain repositories. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaInfraModule {}
