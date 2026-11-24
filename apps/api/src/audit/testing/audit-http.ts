import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { ProjectGrant } from '../../internal/project-grant';
import { testProjectGrant } from '../../internal/testing/project-grant.fixture';
import { InternalGuard } from '../../internal/internal.guard';
import { InternalAuditController } from '../audit.controller';
import { AUDIT_SINK, type AuditSink } from '../audit.sink';

export const AUDIT_TEST_TOKEN = 'audit-test-only-internal-token-32chars';
export const AUDIT_TEST_PROJECT = 'project-1';

export async function createAuditTestApp(repo: Pick<AuditSink, 'append'>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [InternalAuditController],
    providers: [
      InternalGuard,
      { provide: ProjectGrant, useValue: testProjectGrant([AUDIT_TEST_PROJECT]) },
      { provide: AUDIT_SINK, useValue: repo },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          GRAVESHIFT_API_INTERNAL_TOKEN: AUDIT_TEST_TOKEN,
        }),
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  await app.init();
  return app;
}
