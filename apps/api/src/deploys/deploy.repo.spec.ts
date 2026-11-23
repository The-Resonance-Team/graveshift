import { describe, expect, test } from 'bun:test';

import type { AuditRepo } from '../audit/repo/audit.repo';
import type { PrismaService } from '../infra/prisma.service';
import { DeployRepo } from './deploy.repo';
import { AppendOnlyDeployError } from './deploy.types';

const repo = new DeployRepo({} as PrismaService, {} as AuditRepo);

describe('Deploy repository append-only rule', () => {
  test('append-only rejects UPDATE', () => {
    expect(() => repo.update()).toThrow(AppendOnlyDeployError);
  });

  test('append-only rejects DELETE', () => {
    expect(() => repo.delete()).toThrow(AppendOnlyDeployError);
  });
});
