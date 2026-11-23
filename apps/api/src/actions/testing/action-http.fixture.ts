import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { InternalGuard } from '../../internal/internal.guard';
import { ActionRepo } from '../action.repo';
import { InternalActionsController } from '../actions.controller';
import { ACTION_TEST_TOKEN } from './action.fixture';

export async function createActionsTestApp(repo: Pick<ActionRepo, 'claim' | 'complete'>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [InternalActionsController],
    providers: [
      InternalGuard,
      { provide: ActionRepo, useValue: repo },
      {
        provide: ConfigService,
        useValue: new ConfigService({ GRAVESHIFT_API_INTERNAL_TOKEN: ACTION_TEST_TOKEN }),
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
