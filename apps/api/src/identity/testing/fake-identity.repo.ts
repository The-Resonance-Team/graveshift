import { randomUUID } from 'node:crypto';

import {
  IdentityConflictError,
  MIGRATED_ORG_ID,
  type AccountRecord,
  type DaemonGrantRecord,
  type IdentityRepo,
  type MembershipRecord,
  type OAuthClientRecord,
  type OrganizationRecord,
  type ProjectRecord,
} from '../identity.types';

/** In-memory identity store for HTTP tests. No network or database call is made. */
export class FakeIdentityRepo implements IdentityRepo {
  readonly accounts = new Map<string, AccountRecord>();
  readonly organizations = new Map<string, OrganizationRecord>();
  readonly memberships = new Map<string, MembershipRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly clients = new Map<string, OAuthClientRecord>();
  readonly grants = new Map<string, DaemonGrantRecord>();
  /** Test seam: fail the root bootstrap before any in-memory write is committed. */
  failBootstrap = false;
  /** Test seam: simulate a competing API instance that seeded the root Account. */
  seedWinnerOnBootstrap = false;
  private sequence = 9999;

  async countAccounts(): Promise<number> {
    return this.accounts.size;
  }

  async bootstrapRoot(input: {
    email: string;
    passwordHash: string;
    mustChangePassword: boolean;
    orgName: string;
    orgSlug: string;
  }): Promise<{ account: AccountRecord; organization: OrganizationRecord }> {
    if (this.accounts.size > 0) {
      throw new IdentityConflictError('The root admin was already seeded');
    }
    if (this.seedWinnerOnBootstrap) {
      const winner: AccountRecord = {
        id: randomUUID(),
        email: `winner-${randomUUID()}@identity.test`,
        passwordHash: 'test-only-hash',
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      };
      this.accounts.set(winner.id, winner);
      throw new IdentityConflictError('The root admin was already seeded');
    }
    if ([...this.organizations.values()].some((org) => org.slug === input.orgSlug)) {
      throw new IdentityConflictError('The root Organization slug is already used');
    }
    // Stage every write. Nothing is visible until the whole bootstrap succeeds.
    const account: AccountRecord = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      mustChangePassword: input.mustChangePassword,
      createdAt: new Date().toISOString(),
    };
    const organization: OrganizationRecord = {
      id: randomUUID(),
      name: input.orgName,
      slug: input.orgSlug,
      createdAt: new Date().toISOString(),
    };
    const membership: MembershipRecord = {
      accountId: account.id,
      orgId: organization.id,
      role: 'owner',
    };
    if (this.failBootstrap) throw new Error('Simulated mid-bootstrap failure');
    this.accounts.set(account.id, account);
    this.organizations.set(organization.id, organization);
    this.memberships.set(`${account.id}:${organization.id}`, membership);
    for (const project of this.projects.values()) {
      if (project.orgId === MIGRATED_ORG_ID) project.orgId = organization.id;
    }
    if (!this.grants.has('default')) {
      this.grants.set('default', {
        id: randomUUID(),
        name: 'default',
        projectIds: [],
      });
    }
    return { account, organization };
  }

  async findAccountByEmail(email: string): Promise<AccountRecord | undefined> {
    return [...this.accounts.values()].find((account) => account.email === email);
  }

  async findAccountById(id: string): Promise<AccountRecord | undefined> {
    return this.accounts.get(id);
  }

  async addAccount(input: {
    email: string;
    passwordHash: string;
    mustChangePassword: boolean;
  }): Promise<AccountRecord> {
    const account: AccountRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    const account = this.accounts.get(id);
    if (account !== undefined) {
      account.passwordHash = passwordHash;
      account.mustChangePassword = false;
    }
  }

  async findOrganizationBySlug(slug: string): Promise<OrganizationRecord | undefined> {
    return [...this.organizations.values()].find((org) => org.slug === slug);
  }

  async addOrganization(input: {
    name: string;
    slug: string;
    id?: string;
  }): Promise<OrganizationRecord> {
    const organization: OrganizationRecord = {
      name: input.name,
      slug: input.slug,
      id: input.id ?? randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.organizations.set(organization.id, organization);
    return organization;
  }

  async createOrganizationForOwner(
    accountId: string,
    input: { name: string; slug: string },
    onlyIfNoMembership: boolean,
  ): Promise<OrganizationRecord> {
    if (onlyIfNoMembership && (await this.listMemberships(accountId)).length > 0) {
      throw new IdentityConflictError('The account already belongs to an Organization');
    }
    if ([...this.organizations.values()].some((org) => org.slug === input.slug)) {
      throw new IdentityConflictError('The Organization slug is already used');
    }
    const organization = await this.addOrganization(input);
    await this.addMembership({ accountId, orgId: organization.id, role: 'owner' });
    return organization;
  }

  async addMembership(input: MembershipRecord): Promise<void> {
    const key = `${input.accountId}:${input.orgId}`;
    if (this.memberships.has(key)) {
      throw new IdentityConflictError('The Account already belongs to this Organization');
    }
    this.memberships.set(key, input);
  }

  async addMemberToOrg(accountId: string, orgId: string, role: 'owner' | 'member'): Promise<void> {
    await this.addMembership({ accountId, orgId, role });
  }

  async hasMembership(accountId: string, orgId: string): Promise<boolean> {
    return this.memberships.has(`${accountId}:${orgId}`);
  }

  async listMemberships(accountId: string): Promise<MembershipRecord[]> {
    return [...this.memberships.values()].filter((item) => item.accountId === accountId);
  }

  async addProject(input: {
    projectId: string;
    orgId: string;
    name: string;
    slug: string;
  }): Promise<ProjectRecord> {
    const project: ProjectRecord = { ...input, createdAt: new Date().toISOString() };
    this.projects.set(project.projectId, project);
    return project;
  }

  async createProjectWithGrant(
    input: { projectId: string; orgId: string; name: string; slug: string },
    grantName: string,
  ): Promise<ProjectRecord> {
    if (
      [...this.projects.values()].some(
        (item) => item.orgId === input.orgId && item.slug === input.slug,
      )
    ) {
      throw new IdentityConflictError('The Project slug is already used in this Organization');
    }
    const project: ProjectRecord = { ...input, createdAt: new Date().toISOString() };
    const grant = this.grants.get(grantName);
    if (grant !== undefined && !grant.projectIds.includes(input.projectId)) {
      grant.projectIds.push(input.projectId);
    }
    this.projects.set(project.projectId, project);
    return project;
  }

  async findProject(projectId: string): Promise<ProjectRecord | undefined> {
    return this.projects.get(projectId);
  }

  async findProjectBySlug(orgId: string, slug: string): Promise<ProjectRecord | undefined> {
    return [...this.projects.values()].find(
      (project) => project.orgId === orgId && project.slug === slug,
    );
  }

  async listProjects(orgId: string): Promise<ProjectRecord[]> {
    return [...this.projects.values()].filter((project) => project.orgId === orgId);
  }

  async adoptMigratedProjects(orgId: string): Promise<void> {
    for (const project of this.projects.values()) {
      if (project.orgId === '00000000-0000-4000-8000-000000000000') project.orgId = orgId;
    }
  }

  async nextProjectId(): Promise<string> {
    this.sequence += 1;
    return String(this.sequence);
  }

  async addOAuthClient(input: OAuthClientRecord): Promise<void> {
    this.clients.set(input.clientId, input);
  }

  async findOAuthClient(clientId: string): Promise<OAuthClientRecord | undefined> {
    return this.clients.get(clientId);
  }

  async findGrant(name: string): Promise<DaemonGrantRecord | undefined> {
    return this.grants.get(name);
  }

  async addGrant(input: DaemonGrantRecord): Promise<void> {
    this.grants.set(input.name, input);
  }
}
