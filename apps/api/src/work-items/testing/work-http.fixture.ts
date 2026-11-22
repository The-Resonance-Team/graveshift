import { WORK_COMMANDS, type WorkCommands } from '@graveshift/work';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';

import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { CREDENTIAL_CONFIG } from '../../auth/auth.types';
import { OAuthClientCredentialsStrategy } from '../../auth/oauth-client-credentials.strategy';
import { WorkItemsController } from '../controllers/work-items.controller';
import { WorkItemRepo } from '../work-item.repo';

export async function workHttpApp(
  repo: WorkItemRepo,
  commands: WorkCommands,
): Promise<{ app: INestApplication; token: string }> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PassportModule,
      JwtModule.register({}),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ],
    controllers: [WorkItemsController],
    providers: [
      OAuthClientCredentialsStrategy,
      { provide: CREDENTIAL_CONFIG, useValue: TEST_CONFIG },
      { provide: WorkItemRepo, useValue: repo },
      { provide: WORK_COMMANDS, useValue: commands },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );
  await app.init();
  const token = moduleRef.get(JwtService).sign(
    { sub: 'client-1', projectId: 'project-1', scope: ['tokens:manage'] },
    {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      expiresIn: 300,
    },
  );
  return { app, token };
}
