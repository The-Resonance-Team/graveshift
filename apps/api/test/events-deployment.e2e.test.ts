import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import {
  accessToken,
  buildAuthApp,
  validEnvelope,
  type AuthTestApp,
} from './fakes/auth-test-helpers';

describe('POST /api/events deployment binding (e2e)', () => {
  let ctx: AuthTestApp;
  let app: INestApplication;
  let manageToken: string;

  beforeAll(async () => {
    ctx = await buildAuthApp();
    app = ctx.app;
    manageToken = accessToken(ctx.jwt, ['tokens:manage', 'events:publish']);
  });

  afterAll(async () => {
    await app.close();
  });

  async function pluginKey(name: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/credentials')
      .set('authorization', `Bearer ${manageToken}`)
      .send({ kind: 'plugin', name, scopes: ['events:publish'], service: 'api' })
      .expect(201);
    return response.body.value as string;
  }

  const push = (key: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/events')
      .set('authorization', `Bearer ${key}`)
      .send(body);

  test('stamps a known Deployment and writes no unassigned audit entry', async () => {
    const key = await pluginKey('bound-deploy');
    const sha = 'a'.repeat(40);
    await ctx.deploys.append({
      orgId: 'org-1',
      projectId: '12345',
      environmentId: 'env-1',
      environment: 'production',
      deploymentId: sha,
      title: 'deploy-1',
      dateStarted: new Date('2026-11-22T07:00:00.000Z'),
      actor: 'test',
    });
    await push(
      key,
      validEnvelope({ id: 'evt-bound-deploy', deploymentId: sha, environment: 'production' }),
    ).expect(202);
    const published = ctx.publisher.envelopes.find((item) => item.id === 'evt-bound-deploy');
    expect(published?.deploymentId).toBe(sha);
    expect(published?.environment).toBe('production');
    expect(ctx.audit.appended.some((entry) => entry.type === 'event.unassigned')).toBe(false);
  });

  test('an unknown SHA or Environment nulls both fields and writes one audit entry', async () => {
    const key = await pluginKey('unknown-deploy');
    await push(
      key,
      validEnvelope({ id: 'evt-unassigned', deploymentId: 'b'.repeat(40), environment: 'sandbox' }),
    ).expect(202);
    await push(key, validEnvelope({ id: 'evt-no-binding' })).expect(202);
    const unassigned = ctx.publisher.envelopes.filter((item) =>
      ['evt-unassigned', 'evt-no-binding'].includes(item.id),
    );
    expect(unassigned).toHaveLength(2);
    for (const envelope of unassigned) {
      expect(envelope.deploymentId).toBeNull();
      expect(envelope.environment).toBeNull();
    }
    const entries = ctx.audit.appended.filter((entry) => entry.type === 'event.unassigned');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      projectId: '12345',
      payload: { projectId: '12345', deploymentId: 'b'.repeat(40), environment: 'sandbox' },
    });
  });
});
