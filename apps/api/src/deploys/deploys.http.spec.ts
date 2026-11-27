import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../test/database/fixtures';
import {
  bearer,
  buildDeployTestApp,
  clientToken,
  http,
  setupDeployDatabase,
  type DeployTestContext,
} from './testing/deploy-http.fixture';

const STARTED = '2026-11-22T07:00:00.000Z';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

describe.skipIf(!dbTestEnabled)('deployment routes (HTTP)', () => {
  setupDeployDatabase();
  let context: DeployTestContext;

  beforeAll(async () => {
    context = await buildDeployTestApp();
  });

  afterAll(async () => {
    await context?.app.close();
  });

  const route = (orgId: string, projectId: string) =>
    `/api/organizations/${orgId}/projects/${projectId}/deployments`;

  const create = (token: string, orgId: string, projectId: string, body: object) =>
    http(context).post(route(orgId, projectId)).set(bearer(token)).send(body);

  const ciToken = () =>
    clientToken(context, context.orgCiClient, context.projectA, ['org:ci', 'project:write']);

  /** Seed Deployment rows directly: a 403 or a read test must not depend on earlier tests. */
  const seedRows = async (
    rows: ReadonlyArray<readonly [projectId: string, deploymentId: string, environment: string]>,
  ) => {
    await context.db.deploy.createMany({
      data: rows.map(([projectId, deploymentId, environment]) => ({
        projectId,
        deploymentId,
        environment,
        title: 'seed',
        dateStarted: new Date(STARTED),
      })),
    });
  };

  test('POST appends a Deployment with a commit SHA and no internal row id', async () => {
    const result = await create(await ciToken(), context.orgA, context.projectA, {
      deploymentId: SHA_A,
      title: 'deploy-1',
      environment: 'production',
      dateStarted: STARTED,
      url: 'https://ci.example.test/runs/42',
    }).expect(201);

    expect(result.body).toMatchObject({
      projectId: context.projectA,
      deploymentId: SHA_A,
      environment: 'production',
      title: 'deploy-1',
      dateStarted: STARTED,
      url: 'https://ci.example.test/runs/42',
      dateFinished: null,
      closedAt: null,
    });
    expect(result.body.id).toBeUndefined();
    expect(result.body.releaseId).toBeUndefined();
    expect(result.body.projectIds).toBeUndefined();
    expect(await context.db.deploy.count()).toBe(1);
  });

  test('POST with org:ci targets another Project in the same Organization', async () => {
    const result = await create(await ciToken(), context.orgA, context.projectA2, {
      deploymentId: 'd'.repeat(40),
      title: 'second-project',
      environment: 'staging',
      dateStarted: STARTED,
    }).expect(201);
    expect(result.body.projectId).toBe(context.projectA2);
  });

  test('a Project-bound client creates a Deployment for its bound Project', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await create(token, context.orgA, context.projectA, {
      deploymentId: SHA_B,
      title: 'bound',
      environment: 'bound-env',
      dateStarted: STARTED,
    }).expect(201);
    expect(result.body.projectId).toBe(context.projectA);
  });

  test('a bound client targeting another Project returns 403', async () => {
    await seedRows([
      [context.projectA, SHA_A, 'production'],
      [context.projectA, SHA_B, 'bound-env'],
      [context.projectA2, 'd'.repeat(40), 'staging'],
    ]);
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    await create(token, context.orgA, context.projectA2, {
      deploymentId: SHA_C,
      title: 'foreign',
      environment: 'canary',
      dateStarted: STARTED,
    }).expect(403);
    expect(await context.db.deploy.count()).toBe(3);
  });

  test('a foreign Organization returns 403', async () => {
    await create(await ciToken(), context.orgB, context.projectA, {
      deploymentId: SHA_C,
      title: 'foreign-org',
      environment: 'production',
      dateStarted: STARTED,
    }).expect(403);
  });

  test('a Project outside the caller Organization returns 403', async () => {
    await seedRows([
      [context.projectA, SHA_A, 'production'],
      [context.projectA, SHA_B, 'bound-env'],
      [context.projectA2, 'd'.repeat(40), 'staging'],
    ]);
    await create(await ciToken(), context.orgA, context.projectB, {
      deploymentId: SHA_C,
      title: 'foreign-project',
      environment: 'production',
      dateStarted: STARTED,
    }).expect(403);
    expect(await context.db.deploy.count()).toBe(3);
  });

  test('a missing scope returns 403', async () => {
    const token = await clientToken(context, context.clientA2, context.projectA2, ['project:read']);
    await create(token, context.orgA, context.projectA2, {
      deploymentId: SHA_C,
      title: 'no-scope',
      environment: 'production',
      dateStarted: STARTED,
    }).expect(403);
  });

  test('an invalid token returns 401', async () => {
    await http(context)
      .get(route(context.orgA, context.projectA))
      .set('authorization', 'Bearer invalid-test-token')
      .expect(401);
  });

  test('anonymous request is 401 before any store access', async () => {
    const original = context.identity.findOAuthClient.bind(context.identity);
    context.identity.findOAuthClient = async () => {
      throw new Error('The identity store must not be read for an anonymous request');
    };
    try {
      await http(context).get(route(context.orgA, context.projectA)).expect(401);
    } finally {
      context.identity.findOAuthClient = original;
    }
  });

  for (const body of [
    { deploymentId: 'A'.repeat(40) },
    { deploymentId: 'short' },
    { title: '' },
    { title: 'x'.repeat(201) },
    { environment: '' },
    { environment: 'Authorization: Bearer abcdef123456' },
    { environment: 'prod deployment' },
    { dateStarted: 'yesterday' },
    { url: 'javascript:alert(1)' },
    { releaseId: 'release-1' },
    { projects: ['1001'] },
    { name: 'old-name' },
  ]) {
    test(`POST rejects invalid field ${JSON.stringify(body).slice(0, 60)} with 422`, async () => {
      await create(await ciToken(), context.orgA, context.projectA, {
        deploymentId: SHA_C,
        title: 'valid',
        environment: 'validation',
        dateStarted: STARTED,
        ...body,
      }).expect(422);
    });
  }

  test('a redeploy of the same SHA and Environment returns 200 with no new row or audit', async () => {
    const token = await ciToken();
    const body = {
      deploymentId: SHA_C,
      title: 'deploy-1',
      environment: 'production',
      dateStarted: STARTED,
    };
    const first = await create(token, context.orgA, context.projectA, body).expect(201);
    const rowsAfterFirst = await context.db.deploy.count();
    const entriesAfterFirst = await context.db.auditEntry.count();
    const second = await create(token, context.orgA, context.projectA, {
      ...body,
      title: 'changed title',
    }).expect(200);
    expect(second.body).toEqual(first.body);
    expect(await context.db.deploy.count()).toBe(rowsAfterFirst);
    expect(await context.db.auditEntry.count()).toBe(entriesAfterFirst);
  });

  test('GET lists only the route Project Deployments even for org:read', async () => {
    await seedRows([
      [context.projectA, SHA_A, 'production'],
      [context.projectA, SHA_B, 'bound-env'],
      [context.projectA, SHA_C, 'production'],
      [context.projectA2, 'd'.repeat(40), 'staging'],
      [context.projectB, 'f'.repeat(40), 'production'],
    ]);
    const token = await clientToken(context, context.clientA, context.projectA, ['org:read']);
    const result = await http(context)
      .get(route(context.orgA, context.projectA))
      .set(bearer(token))
      .expect(200);
    expect(result.body).toHaveLength(3);
    expect(
      result.body.every((row: { projectId: string }) => row.projectId === context.projectA),
    ).toBe(true);
    expect(result.body.some((row: { id?: string }) => row.id !== undefined)).toBe(false);
  });

  test('GET with project:read returns only the bound Project', async () => {
    await seedRows([[context.projectA2, 'd'.repeat(40), 'staging']]);
    const token = await clientToken(context, context.clientA2, context.projectA2, ['project:read']);
    const result = await http(context)
      .get(route(context.orgA, context.projectA2))
      .set(bearer(token))
      .expect(200);
    expect(result.body).toHaveLength(1);
    expect(result.body[0].projectId).toBe(context.projectA2);
  });

  test('GET filters by deploymentId and Environment', async () => {
    await seedRows([
      [context.projectA, SHA_A, 'production'],
      [context.projectA, SHA_B, 'production'],
      [context.projectA, 'c'.repeat(40), 'staging'],
    ]);
    const token = await clientToken(context, context.clientA, context.projectA, ['org:read']);
    const bySha = await http(context)
      .get(route(context.orgA, context.projectA))
      .query({ deploymentId: SHA_A })
      .set(bearer(token))
      .expect(200);
    expect(bySha.body).toHaveLength(1);
    expect(bySha.body[0].deploymentId).toBe(SHA_A);

    const byEnvironment = await http(context)
      .get(route(context.orgA, context.projectA))
      .query({ environment: 'production' })
      .set(bearer(token))
      .expect(200);
    expect(byEnvironment.body).toHaveLength(2);
    expect(
      byEnvironment.body.every((row: { environment: string }) => row.environment === 'production'),
    ).toBe(true);

    await http(context)
      .get(route(context.orgA, context.projectA))
      .query({ deploymentId: 'not-a-sha' })
      .set(bearer(token))
      .expect(422);
  });

  test('Environment is a string on the Deployment, not a separate row', async () => {
    await seedRows([
      [context.projectA, SHA_A, 'production'],
      [context.projectA, SHA_B, 'bound-env'],
      [context.projectA, SHA_C, 'canary'],
      [context.projectA2, 'd'.repeat(40), 'staging'],
    ]);
    const token = await ciToken();
    const result = await create(token, context.orgA, context.projectA, {
      deploymentId: 'e'.repeat(40),
      title: 'env-as-string',
      environment: 'sandbox',
      dateStarted: STARTED,
    }).expect(201);
    expect(typeof result.body.environment).toBe('string');
    expect(result.body.environment).toBe('sandbox');
    expect(result.body.environmentId).toBeUndefined();
    expect(await context.db.deploy.count()).toBe(5);
  });
});
