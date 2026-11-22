import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  bearer,
  buildDeployTestApp,
  clientToken,
  http,
  type DeployTestContext,
} from '../deploys/testing/deploy-http.fixture';

describe('release routes (HTTP)', () => {
  let context: DeployTestContext;

  beforeAll(async () => {
    context = await buildDeployTestApp();
  });

  afterAll(async () => {
    await context?.app.close();
  });

  test('create a Release for two Projects in one Organization', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await http(context)
      .post(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .send({ version: 'v3.2.0', projects: [context.projectA, context.projectA2] })
      .expect(201);

    expect(result.body.orgId).toBe(context.orgA);
    expect(result.body.version).toBe('v3.2.0');
    expect(result.body.projectIds).toEqual([context.projectA, context.projectA2]);
  });

  test('list Releases in the caller Organization', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['org:read']);
    const result = await http(context)
      .get(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .expect(200);

    expect(result.body).toHaveLength(1);
    expect(result.body[0].version).toBe('v3.2.0');
    expect(result.body[0].projectIds).toEqual([context.projectA, context.projectA2]);
  });

  test('a foreign Organization returns 403', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['org:read']);
    const result = await http(context)
      .get(`/api/organizations/${context.orgB}/releases`)
      .set(bearer(token))
      .expect(403);
    expect(result.body.statusCode).toBe(403);
  });

  test('a Project outside the caller Organization returns 403', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await http(context)
      .post(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .send({ version: 'v9.9.9', projects: [context.projectA, context.projectB] })
      .expect(403);
    expect(result.body.statusCode).toBe(403);
    expect(context.releases.rows.size).toBe(1);
  });

  test('anonymous request is 401 before any store access', async () => {
    const original = context.identity.findOAuthClient.bind(context.identity);
    context.identity.findOAuthClient = async () => {
      throw new Error('The identity store must not be read for an anonymous request');
    };
    try {
      const result = await http(context)
        .get(`/api/organizations/${context.orgA}/releases`)
        .expect(401);
      expect(result.body.statusCode).toBe(401);
      expect(context.releases.rows.size).toBe(1);
    } finally {
      context.identity.findOAuthClient = original;
    }
  });
});
