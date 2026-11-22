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

  beforeAll(async () => {
    context = await buildDeployTestApp();
    const release = await context.releases.create({
      orgId: context.orgA,
      version: 'v3.2.0',
      projectIds: [context.projectA, context.projectA2],
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

  test('create a Deploy with an environment and a projects array', async () => {
    const token = await clientToken(context, context.ciClient, context.projectA, ['org:ci']);
    const result = await create(token, context.orgA, {
      environment: 'production',
      projects: [context.projectA],
      url: 'https://ci.example.test/runs/42',
    }).expect(201);

    expect(result.body.orgId).toBe(context.orgA);
    expect(result.body.releaseId).toBe(releaseId);
    expect(result.body.environment).toBe('production');
    expect(result.body.dateStarted).toBe(STARTED);
    expect(result.body.projectIds).toEqual([context.projectA]);
    expect(context.environments.rows.size).toBe(1);
  });

  test('create a Deploy with no projects array targets all Release Projects', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await create(token, context.orgA, { environment: 'staging' }).expect(201);

    expect(result.body.projectIds).toEqual([context.projectA, context.projectA2]);
    expect(result.body.dateFinished).toBeNull();
    expect(result.body.url).toBeNull();
  });

  test('a foreign Organization returns 403', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await create(token, context.orgB, { environment: 'production' }).expect(403);
    expect(result.body.statusCode).toBe(403);
  });

  test('a Project outside the caller Organization returns 403', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await create(token, context.orgA, {
      environment: 'production',
      projects: [context.projectB],
    }).expect(403);
    expect(result.body.statusCode).toBe(403);
    expect(context.deploys.rows.size).toBe(2);
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
      expect(context.deploys.rows.size).toBe(2);
    } finally {
      context.identity.findOAuthClient = original;
    }
  });

  test('environments are listed in the caller Organization', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:read']);
    const result = await http(context)
      .get(`/api/organizations/${context.orgA}/environments`)
      .set(bearer(token))
      .expect(200);
    expect(result.body.map((row: { name: string }) => row.name)).toEqual(['production', 'staging']);
  });
});
