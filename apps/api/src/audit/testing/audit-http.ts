import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { InternalGuard } from '../../internal/internal.guard';
import { InternalAuditController } from '../audit.controller';
import { AuditRepo } from '../audit.repo';

export const AUDIT_TEST_TOKEN = 'audit-test-only-internal-token-32chars';
export const AUDIT_TEST_PROJECT = 'project-1';

export async function createAuditTestApp(repo: Pick<AuditRepo, 'append'>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [InternalAuditController],
    providers: [
      InternalGuard,
      { provide: AuditRepo, useValue: repo },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          GRAVESHIFT_API_INTERNAL_TOKEN: AUDIT_TEST_TOKEN,
          GRAVESHIFT_PROJECT_ID: AUDIT_TEST_PROJECT,
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
