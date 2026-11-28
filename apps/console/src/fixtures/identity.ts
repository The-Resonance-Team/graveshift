import {
  memberAccountScope,
  newAccountScope,
  organizationScope,
  ownerAccountScope,
  passwordAccountScope,
  projectScope,
  sampleFixture,
  SAMPLE_IDS,
  SAMPLE_TIMESTAMPS,
  sandboxProjectScope,
} from './sample';

export interface SampleAccount {
  id: string;
  email: string;
  mustChangePassword: boolean;
  organizations: Array<{ orgId: string; role: 'owner' | 'member' }>;
}

export interface SampleOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface SampleProject {
  projectId: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export const sampleAccounts = [
  sampleFixture<SampleAccount>('account-owner', 'api_shaped', ownerAccountScope, {
    id: SAMPLE_IDS.ownerAccount,
    email: 'owner@example.com',
    mustChangePassword: false,
    organizations: [{ orgId: SAMPLE_IDS.organization, role: 'owner' }],
  }),
  sampleFixture<SampleAccount>('account-member', 'api_shaped', memberAccountScope, {
    id: SAMPLE_IDS.memberAccount,
    email: 'member@example.com',
    mustChangePassword: false,
    organizations: [{ orgId: SAMPLE_IDS.organization, role: 'member' }],
  }),
  sampleFixture<SampleAccount>('account-new', 'api_shaped', newAccountScope, {
    id: SAMPLE_IDS.newAccount,
    email: 'new@example.com',
    mustChangePassword: false,
    organizations: [],
  }),
  sampleFixture<SampleAccount>('account-password-change', 'api_shaped', passwordAccountScope, {
    id: SAMPLE_IDS.passwordAccount,
    email: 'password@example.com',
    mustChangePassword: true,
    organizations: [{ orgId: SAMPLE_IDS.organization, role: 'owner' }],
  }),
] as const;

export const sampleOrganizations = [
  sampleFixture<SampleOrganization>('organization-sample', 'api_shaped', organizationScope, {
    id: SAMPLE_IDS.organization,
    name: 'Sample Operations',
    slug: 'sample-operations',
    createdAt: SAMPLE_TIMESTAMPS.earlier,
  }),
] as const;

export const sampleProjects = [
  sampleFixture<SampleProject>('project-checkout', 'api_shaped', projectScope, {
    projectId: SAMPLE_IDS.checkoutProject,
    orgId: SAMPLE_IDS.organization,
    name: 'Checkout API',
    slug: 'checkout-api',
    createdAt: SAMPLE_TIMESTAMPS.earlier,
  }),
  sampleFixture<SampleProject>('project-sandbox', 'api_shaped', sandboxProjectScope, {
    projectId: SAMPLE_IDS.sandboxProject,
    orgId: SAMPLE_IDS.organization,
    name: 'Sandbox',
    slug: 'sandbox',
    createdAt: SAMPLE_TIMESTAMPS.earlier,
  }),
] as const;
