import { Prisma } from '@prisma/client';
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
    const token = await clientToken(context, context.orgCiClient, context.projectA, [
      'project:write',
      'org:ci',
    ]);
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

  test('create a Release for one Project in the same Organization', async () => {
    const token = await clientToken(context, context.orgCiClient, context.projectA, [
      'project:write',
      'org:ci',
    ]);
    const result = await http(context)
      .post(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .send({ version: 'v3.2.1', projects: [context.projectA] })
      .expect(201);
    expect(result.body.projectIds).toEqual([context.projectA]);
  });

  test('project:read list does not return other Projects data', async () => {
    const token = await clientToken(context, context.clientA2, context.projectA2, ['project:read']);
    const result = await http(context)
      .get(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .expect(200);

    expect(result.body).toHaveLength(1);
    expect(result.body[0].version).toBe('v3.2.0');
    expect(
      result.body.every((row: { projectIds: string[] }) =>
        row.projectIds.includes(context.projectA2),
      ),
    ).toBe(true);
  });

  test('a Project-bound client targeting another Project in the Organization returns 403', async () => {
    const token = await clientToken(context, context.clientA, context.projectA, ['project:write']);
    const result = await http(context)
      .post(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .send({ version: 'v9.9.8', projects: [context.projectA2] })
      .expect(403);
    expect(result.body.statusCode).toBe(403);
    expect(context.releases.rows.size).toBe(2);
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
    const token = await clientToken(context, context.orgCiClient, context.projectA, [
      'project:write',
      'org:ci',
    ]);
    const result = await http(context)
      .post(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .send({ version: 'v9.9.9', projects: [context.projectB] })
      .expect(403);
    expect(result.body.statusCode).toBe(403);
    expect(context.releases.rows.size).toBe(2);
  });

  test('a missing scope returns 403', async () => {
    const token = await clientToken(context, context.clientA2, context.projectA2, ['project:read']);
    await http(context)
      .post(`/api/organizations/${context.orgA}/releases`)
      .set(bearer(token))
      .send({ version: 'v9.9.7', projects: [context.projectA2] })
      .expect(403);
    expect(context.releases.rows.size).toBe(2);
  });

  test('an invalid token returns 401', async () => {
    await http(context)
      .get(`/api/organizations/${context.orgA}/releases`)
      .set('authorization', 'Bearer invalid-test-token')
      .expect(401);
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
      expect(context.releases.rows.size).toBe(2);
    } finally {
      context.identity.findOAuthClient = original;
    }
  });

  test('a store unique violation returns 409', async () => {
    const original = context.releases.create.bind(context.releases);
    context.releases.create = async () => {
      throw new Prisma.PrismaClientKnownRequestError('unique version', {
        code: 'P2002',
        clientVersion: 'test',
      });
    };
    try {
      const token = await clientToken(context, context.orgCiClient, context.projectA, [
        'project:write',
        'org:ci',
      ]);
      await http(context)
        .post(`/api/organizations/${context.orgA}/releases`)
        .set(bearer(token))
        .send({ version: 'v3.2.2', projects: [context.projectA] })
        .expect(409);
    } finally {
      context.releases.create = original;
    }
  });
});
