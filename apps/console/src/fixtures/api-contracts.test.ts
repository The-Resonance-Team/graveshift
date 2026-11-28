import { describe, expect, test } from 'bun:test';

import { credentialListSchema } from '../../../api/src/auth/auth.schema';
import { deploySchema } from '../../../api/src/deploys/deploys.schema';
import {
  accountSchema,
  organizationSchema,
  projectSchema,
} from '../../../api/src/identity/identity.schema';
import { emptyCredentialList, sampleCredentialList, sampleCredentials } from './credentials';
import { sampleDeployments } from './deployments';
import { sampleAccounts, sampleOrganizations, sampleProjects } from './identity';
import { SAMPLE_IDS } from './sample';

function expectExactKeys(value: object, keys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

describe('identity response fixtures', () => {
  test('accounts match the response schema and carry no unsupported fields', () => {
    for (const fixture of sampleAccounts) {
      expect(accountSchema.parse(fixture.payload)).toEqual(fixture.payload);
      expectExactKeys(fixture.payload, Object.keys(accountSchema.shape));
      expect(fixture.scope.kind).toBe('account');
      if (fixture.scope.kind !== 'account') throw new Error('Expected an Account scope');
      expect(fixture.payload.id).toBe(fixture.scope.accountId);
      for (const membership of fixture.payload.organizations) {
        expectExactKeys(membership, ['orgId', 'role']);
        expect(membership.orgId).toBe(SAMPLE_IDS.organization);
      }
    }
  });

  test('organizations and Projects match their response schemas and scopes', () => {
    for (const fixture of sampleOrganizations) {
      expect(organizationSchema.parse(fixture.payload)).toEqual(fixture.payload);
      expectExactKeys(fixture.payload, Object.keys(organizationSchema.shape));
      expect(fixture.scope.kind).toBe('organization');
      if (fixture.scope.kind !== 'organization') throw new Error('Expected an Organization scope');
      expect(fixture.payload.id).toBe(fixture.scope.orgId);
    }
    for (const fixture of sampleProjects) {
      expect(projectSchema.parse(fixture.payload)).toEqual(fixture.payload);
      expectExactKeys(fixture.payload, Object.keys(projectSchema.shape));
      expect(fixture.payload.projectId).toMatch(/^\d{1,20}$/);
      expect(fixture.scope.kind).toBe('project');
      if (fixture.scope.kind !== 'project') throw new Error('Expected a Project scope');
      expect(fixture.payload.projectId).toBe(fixture.scope.projectId);
      expect(fixture.payload.orgId).toBe(fixture.scope.orgId);
    }
  });
});

describe('Deployment fixtures', () => {
  test('Deployments match the response schema and Project scope', () => {
    for (const fixture of sampleDeployments) {
      expect(deploySchema.parse(fixture.payload)).toEqual(fixture.payload);
      expectExactKeys(fixture.payload, Object.keys(deploySchema.shape));
      expect(fixture.payload.deploymentId).toMatch(/^[0-9a-f]{40}$/);
      expect(fixture.scope.kind).toBe('project');
      if (fixture.scope.kind !== 'project') throw new Error('Expected a Project scope');
      expect(fixture.payload.projectId).toBe(fixture.scope.projectId);
    }
  });
});

describe('credential metadata fixtures', () => {
  test('credential lists match the response schema without secret material', () => {
    for (const list of [sampleCredentialList, emptyCredentialList]) {
      expect(credentialListSchema.parse(list.payload)).toEqual(list.payload);
      expectExactKeys(list.payload, ['items']);
    }
    for (const fixture of sampleCredentials) {
      expectExactKeys(fixture.payload, [
        'id',
        'kind',
        'name',
        'scopes',
        'service',
        'createdAt',
        'expiresAt',
        'revokedAt',
      ]);
      expect(sampleCredentialList.payload.items).toContainEqual(fixture.payload);
    }
  });

  test('identity and credential fixtures contain no passwords, tokens, or secret values', () => {
    const serialized = JSON.stringify([...sampleAccounts, ...sampleCredentialList.payload.items]);
    expect(serialized).not.toMatch(/"(?:password|access_token|clientSecret|value|hash|prefix)"/);
  });
});
