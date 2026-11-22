import { randomUUID } from 'node:crypto';

import {
  IdentityConflictError,
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
  private sequence = 9999;

  async countAccounts(): Promise<number> {
    return this.accounts.size;
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

  async grantProject(name: string, projectId: string): Promise<void> {
    const grant = this.grants.get(name);
    if (grant !== undefined && !grant.projectIds.includes(projectId)) {
      grant.projectIds.push(projectId);
    }
  }
}
