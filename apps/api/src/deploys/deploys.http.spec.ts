import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  bearer,
  buildDeployTestApp,
  clientToken,
  http,
  type DeployTestContext,
} from './testing/deploy-http.fixture';

const STARTED = '2026-11-22T07:00:00.000Z';

describe('deploy routes (HTTP)', () => {
  let context: DeployTestContext;
  let releaseId: string;
  let productionId = '';
  let stagingId = '';
  let boundId = '';
  let canaryId = '';

  beforeAll(async () => {
    context = await buildDeployTestApp();
    const release = await context.releases.create({
      orgId: context.orgA,
      version: 'v3.2.0',
      projectIds: [context.projectA, context.projectA2],
      actor: context.orgCiClient,
    });
    releaseId = release.id;
  });

  afterAll(async () => {
    await context?.app.close();
  });

  const create = (token: string, orgId: string, body: Record<string, unknown>) =>
    http(context)
      .post(`/api/organizations/${orgId}/deploys`)
      .set(bearer(token))
      .send({ releaseId, name: 'deploy-1', dateStarted: STARTED, ...body });

  const ciToken = () =>
    clientToken(context, context.orgCiClient, context.projectA, ['org:ci', 'project:write']);

  test('create a Deploy with an environment and a projects array', async () => {
    const result = await create(await ciToken(), context.orgA, {
      environment: 'production',
      projects: [context.projectA],
      url: 'https://ci.example.test/runs/42',
    }).expect(201);

    productionId = result.body.id as string;
    expect(result.body.orgId).toBe(context.orgA);
    expect(result.body.releaseId).toBe(releaseId);
    expect(result.body.environment).toBe('production');
    expect(result.body.dateStarted).toBe(STARTED);
    expect(result.body.projectIds).toEqual([context.projectA]);
    expect(context.environments.rows.size).toBe(1);
  });

  test('create a Deploy with no projects array targets all Release Projects', async () => {
    const result = await create(await ciToken(), context.orgA, { environment: 'staging' }).expect(
      201,
    );

    stagingId = result.body.id as string;
    expect(result.body.projectIds).toEqual([context.projectA, context.projectA2]);
    expect(result.body.dateFinished).toBeNull();
    expect(result.body.url).toBeNull();
  });

  test('a Project-bound client creates a Deploy for its bound Project', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await create(token, context.orgA, {
      environment: 'bound',
      projects: [context.projectA],
    }).expect(201);
    boundId = result.body.id as string;
    expect(result.body.projectIds).toEqual([context.projectA]);
  });

  test('a Project-bound client targeting another Project in the Organization returns 403', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await create(token, context.orgA, {
      environment: 'canary',
      projects: [context.projectA2],
    }).expect(403);
    expect(result.body.statusCode).toBe(403);
    expect(context.deploys.rows.size).toBe(3);
  });

  test('project:read list does not return other Projects data', async () => {
    const canary = await create(await ciToken(), context.orgA, {
      environment: 'canary',
      projects: [context.projectA2],
    }).expect(201);
    canaryId = canary.body.id as string;

    const token = await clientToken(context, context.clientA2, context.projectA2, ['project:read']);
    const result = await http(context)
      .get(`/api/organizations/${context.orgA}/deploys`)
      .set(bearer(token))
      .expect(200);
    const ids = result.body.map((row: { id: string }) => row.id);
    expect(ids).toContain(stagingId);
    expect(ids).toContain(canaryId);
    expect(ids).not.toContain(productionId);
    expect(ids).not.toContain(boundId);
  });

  test('a foreign Organization returns 403', async () => {
    const result = await create(await ciToken(), context.orgB, {
      environment: 'production',
    }).expect(403);
    expect(result.body.statusCode).toBe(403);
  });

  test('a Project outside the caller Organization returns 403', async () => {
    const result = await create(await ciToken(), context.orgA, {
      environment: 'production',
      projects: [context.projectB],
    }).expect(403);
    expect(result.body.statusCode).toBe(403);
    expect(context.deploys.rows.size).toBe(4);
  });

  test('a missing scope returns 403', async () => {
    const token = await clientToken(context, context.clientA2, context.projectA2, ['project:read']);
    await create(token, context.orgA, { environment: 'production' }).expect(403);
  });

  test('an invalid token returns 401', async () => {
    await http(context)
      .get(`/api/organizations/${context.orgA}/deploys`)
      .set('authorization', 'Bearer invalid-test-token')
      .expect(401);
  });

  test('an invalid url is refused at the request boundary', async () => {
    const result = await create(await ciToken(), context.orgA, {
      environment: 'production',
      url: 'not-a-url',
    }).expect(422);
    expect(result.body.statusCode).toBe(422);
  });

  test('anonymous request is 401 before any store access', async () => {
    const original = context.identity.findOAuthClient.bind(context.identity);
    context.identity.findOAuthClient = async () => {
      throw new Error('The identity store must not be read for an anonymous request');
    };
    try {
      const result = await http(context)
        .get(`/api/organizations/${context.orgA}/deploys`)
        .expect(401);
      expect(result.body.statusCode).toBe(401);
      expect(context.deploys.rows.size).toBe(4);
    } finally {
      context.identity.findOAuthClient = original;
    }
  });

  test('environments are filtered for a Project-bound reader', async () => {
    const orgToken = await clientToken(context, context.clientA, context.projectA, ['org:read']);
    const orgResult = await http(context)
      .get(`/api/organizations/${context.orgA}/environments`)
      .set(bearer(orgToken))
      .expect(200);
    const names = orgResult.body.map((row: { name: string }) => row.name);
    expect(names).toEqual(['production', 'staging', 'bound', 'canary']);

    const projectToken = await clientToken(context, context.clientA2, context.projectA2, [
      'project:read',
    ]);
    const projectResult = await http(context)
      .get(`/api/organizations/${context.orgA}/environments`)
      .set(bearer(projectToken))
      .expect(200);
    const scoped = projectResult.body.map((row: { name: string }) => row.name);
    expect(scoped).toEqual(['staging', 'canary']);
  });
});
