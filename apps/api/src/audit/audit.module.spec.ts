import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, test } from 'bun:test';

import { PrismaInfraModule } from '../infra/prisma.module';
import { PrismaService } from '../infra/prisma.service';
import { InternalAccessModule } from '../internal/internal.module';
import { ProjectGrant } from '../internal/project-grant';
import { AuditRepo } from './audit.repo';
import { AUDIT_READER, AUDIT_SINK } from './audit.sink';
import { AuditModule } from './audit.module';

const build = async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      // The same global boot surface the API uses. The audit module reads no boot key: every
      // entry is scoped by the authenticated caller's projectId (ADR 0018).
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({})], cache: true }),
      PrismaInfraModule,
      InternalAccessModule,
      AuditModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ProjectGrant)
    .useValue({ assert: async () => undefined })
    .compile();
  return moduleRef.createNestApplication({ logger: false });
};

describe('AuditModule', () => {
  test('binds both seams to one Postgres owner and needs no Project of its own', async () => {
    // Built from an empty boot surface: no environment key names a Project, so the module cannot
    // write an entry into a chain nobody owns.
    const app = await build();
    try {
      await app.init();
      const sink = app.get(AUDIT_SINK);
      expect(sink).toBeInstanceOf(AuditRepo);
      expect(app.get(AUDIT_READER)).toBe(sink);
    } finally {
      await app.close();
    }
  });
});
