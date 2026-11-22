import type { MembershipRole } from '../generated/prisma/client';

export const IDENTITY_REPO = Symbol('IDENTITY_REPO');
export const ACCOUNT_AUTH = Symbol('ACCOUNT_AUTH');
export const ALLOW_WITHOUT_ORG = Symbol('ALLOW_WITHOUT_ORG');

/** One seed organization owns all Projects rewritten by the identity migration. */
export const MIGRATED_ORG_ID = '00000000-0000-4000-8000-000000000000';

/** The single stored grant used by internal daemon-to-API routes. */
export const DEFAULT_DAEMON_GRANT = 'default';

export const ACCOUNT_JWT_AUDIENCE = 'graveshift-account';

export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface MembershipRecord {
  accountId: string;
  orgId: string;
  role: MembershipRole;
}

export interface ProjectRecord {
  projectId: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface OAuthClientRecord {
  clientId: string;
  secretHash: string;
  orgId: string;
  projectId: string;
  scopes: string[];
}

export interface DaemonGrantRecord {
  id: string;
  name: string;
  projectIds: string[];
}

export interface AccountProfile {
  id: string;
  email: string;
  mustChangePassword: boolean;
  organizations: Array<{ orgId: string; role: MembershipRole }>;
}

export interface AccountPrincipal {
  accountId: string;
  email: string;
  mustChangePassword: boolean;
  memberships: MembershipRecord[];
}

/** Account, Organization, Membership, Project and stored grants in one seam. */
export interface IdentityRepo {
  countAccounts(): Promise<number>;
  findAccountByEmail(email: string): Promise<AccountRecord | undefined>;
  findAccountById(id: string): Promise<AccountRecord | undefined>;
  addAccount(input: {
    email: string;
    passwordHash: string;
    mustChangePassword: boolean;
  }): Promise<AccountRecord>;
  setPassword(id: string, passwordHash: string): Promise<void>;
  findOrganizationBySlug(slug: string): Promise<OrganizationRecord | undefined>;
  addOrganization(input: { name: string; slug: string }): Promise<OrganizationRecord>;
  addMembership(input: MembershipRecord): Promise<void>;
  hasMembership(accountId: string, orgId: string): Promise<boolean>;
  listMemberships(accountId: string): Promise<MembershipRecord[]>;
  addProject(input: {
    projectId: string;
    orgId: string;
    name: string;
    slug: string;
  }): Promise<ProjectRecord>;
  findProject(projectId: string): Promise<ProjectRecord | undefined>;
  findProjectBySlug(orgId: string, slug: string): Promise<ProjectRecord | undefined>;
  listProjects(orgId: string): Promise<ProjectRecord[]>;
  adoptMigratedProjects(orgId: string): Promise<void>;
  nextProjectId(): Promise<string>;
  addOAuthClient(input: OAuthClientRecord): Promise<void>;
  findOAuthClient(clientId: string): Promise<OAuthClientRecord | undefined>;
  findGrant(name: string): Promise<DaemonGrantRecord | undefined>;
  addGrant(input: DaemonGrantRecord): Promise<void>;
  grantProject(name: string, projectId: string): Promise<void>;
}
