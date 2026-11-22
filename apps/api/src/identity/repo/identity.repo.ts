import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type MembershipRole } from '@prisma/client';

import { PrismaService } from '../../infra/prisma.service';
import {
  mapConflict,
  toAccount,
  toGrant,
  toOAuthClient,
  toOrganization,
  toProject,
} from './identity.mapper';
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

@Injectable()
export class PrismaIdentityRepo implements IdentityRepo {
  constructor(private readonly db: PrismaService) {}

  async countAccounts(): Promise<number> {
    return this.db.account.count();
  }

  async findAccountByEmail(email: string): Promise<AccountRecord | undefined> {
    const row = await this.db.account.findUnique({ where: { email } });
    return row === null ? undefined : toAccount(row);
  }

  async findAccountById(id: string): Promise<AccountRecord | undefined> {
    const row = await this.db.account.findUnique({ where: { id } });
    return row === null ? undefined : toAccount(row);
  }

  async addAccount(input: {
    email: string;
    passwordHash: string;
    mustChangePassword: boolean;
  }): Promise<AccountRecord> {
    try {
      return toAccount(
        await this.db.account.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            mustChangePassword: input.mustChangePassword,
          },
        }),
      );
    } catch (error) {
      throw mapConflict(error, 'The account already exists');
    }
  }

  async bootstrapRoot(input: {
    email: string;
    passwordHash: string;
    mustChangePassword: boolean;
    orgName: string;
    orgSlug: string;
  }): Promise<{ account: AccountRecord; organization: OrganizationRecord }> {
    try {
      return await this.db.$transaction(async (tx) => {
        if ((await tx.account.count()) > 0) {
          throw new IdentityConflictError('The root admin was already seeded');
        }
        const account = await tx.account.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            mustChangePassword: input.mustChangePassword,
          },
        });
        const organization = await tx.organization.create({
          data: { name: input.orgName, slug: input.orgSlug },
        });
        await tx.membership.create({
          data: { accountId: account.id, orgId: organization.id, role: 'owner' },
        });
        await tx.project.updateMany({
          where: { orgId: MIGRATED_ORG_ID },
          data: { orgId: organization.id },
        });
        await tx.daemonGrant.upsert({
          where: { name: 'default' },
          create: { id: randomUUID(), name: 'default', projectIds: [] },
          update: {},
        });
        return { account: toAccount(account), organization: toOrganization(organization) };
      });
    } catch (error) {
      throw mapConflict(error, 'The root admin or root Organization already exists');
    }
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.db.account.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  async findOrganizationBySlug(slug: string): Promise<OrganizationRecord | undefined> {
    const row = await this.db.organization.findUnique({ where: { slug } });
    return row === null ? undefined : toOrganization(row);
  }

  async addOrganization(input: { name: string; slug: string }): Promise<OrganizationRecord> {
    try {
      return toOrganization(await this.db.organization.create({ data: input }));
    } catch (error) {
      throw mapConflict(error, 'The Organization slug is already used');
    }
  }

  async createOrganizationForOwner(
    accountId: string,
    input: { name: string; slug: string },
    onlyIfNoMembership: boolean,
  ): Promise<OrganizationRecord> {
    try {
      return await this.db.$transaction(async (tx) => {
        if (onlyIfNoMembership) {
          const count = await tx.membership.count({ where: { accountId } });
          if (count > 0) {
            throw new IdentityConflictError('The account already belongs to an Organization');
          }
        }
        const organization = await tx.organization.create({ data: input });
        await tx.membership.create({
          data: { accountId, orgId: organization.id, role: 'owner' },
        });
        return toOrganization(organization);
      });
    } catch (error) {
      throw mapConflict(error, 'The Organization slug is already used');
    }
  }

  async addMembership(input: MembershipRecord): Promise<void> {
    try {
      await this.db.membership.create({ data: input });
    } catch (error) {
      throw mapConflict(error, 'The Account already belongs to this Organization');
    }
  }

  async addMemberToOrg(accountId: string, orgId: string, role: MembershipRole): Promise<void> {
    try {
      await this.db.membership.create({ data: { accountId, orgId, role } });
    } catch (error) {
      throw mapConflict(error, 'The Account already belongs to this Organization');
    }
  }

  async hasMembership(accountId: string, orgId: string): Promise<boolean> {
    return (
      (await this.db.membership.findUnique({
        where: { accountId_orgId: { accountId, orgId } },
        select: { accountId: true },
      })) !== null
    );
  }

  async listMemberships(accountId: string): Promise<MembershipRecord[]> {
    const rows = await this.db.membership.findMany({ where: { accountId } });
    return rows.map((row) => ({
      accountId: row.accountId,
      orgId: row.orgId,
      role: row.role,
    }));
  }

  async addProject(input: {
    projectId: string;
    orgId: string;
    name: string;
    slug: string;
  }): Promise<ProjectRecord> {
    try {
      return toProject(await this.db.project.create({ data: input }));
    } catch (error) {
      throw mapConflict(error, 'The Project slug is already used in this Organization');
    }
  }

  async createProjectWithGrant(
    input: { projectId: string; orgId: string; name: string; slug: string },
    grantName: string,
  ): Promise<ProjectRecord> {
    try {
      return await this.db.$transaction(async (tx) => {
        const project = await tx.project.create({ data: input });
        // array_append is atomic: concurrent grants cannot overwrite each other.
        await tx.$executeRaw`
          UPDATE "daemon_grants" SET "project_ids" = array_append("project_ids", ${input.projectId})
          WHERE "name" = ${grantName}
            AND NOT (${input.projectId} = ANY("project_ids"))
        `;
        return toProject(project);
      });
    } catch (error) {
      throw mapConflict(error, 'The Project slug is already used in this Organization');
    }
  }

  async findProject(projectId: string): Promise<ProjectRecord | undefined> {
    const row = await this.db.project.findUnique({ where: { projectId } });
    return row === null ? undefined : toProject(row);
  }

  async findProjectBySlug(orgId: string, slug: string): Promise<ProjectRecord | undefined> {
    const row = await this.db.project.findUnique({ where: { orgId_slug: { orgId, slug } } });
    return row === null ? undefined : toProject(row);
  }

  async listProjects(orgId: string): Promise<ProjectRecord[]> {
    return (
      await this.db.project.findMany({ where: { orgId }, orderBy: { projectId: 'asc' } })
    ).map(toProject);
  }

  async adoptMigratedProjects(orgId: string): Promise<void> {
    await this.db.project.updateMany({ where: { orgId: MIGRATED_ORG_ID }, data: { orgId } });
  }

  async nextProjectId(): Promise<string> {
    const rows = await this.db.$queryRaw<Array<{ id: bigint }>>(
      Prisma.sql`SELECT nextval('project_numeric_id_seq')::text AS id`,
    );
    const value = rows[0]?.id;
    if (value === undefined) throw new Error('No numeric Project id was assigned');
    return String(value);
  }

  async addOAuthClient(input: OAuthClientRecord): Promise<void> {
    await this.db.oAuthClient.create({ data: input });
  }

  async findOAuthClient(clientId: string): Promise<OAuthClientRecord | undefined> {
    const row = await this.db.oAuthClient.findUnique({ where: { clientId } });
    return row === null ? undefined : toOAuthClient(row);
  }

  async findGrant(name: string): Promise<DaemonGrantRecord | undefined> {
    const row = await this.db.daemonGrant.findUnique({ where: { name } });
    return row === null ? undefined : toGrant(row);
  }

  async addGrant(input: DaemonGrantRecord): Promise<void> {
    await this.db.daemonGrant.create({ data: input });
  }

  async grantProject(name: string, projectId: string): Promise<void> {
    const grant = await this.findGrant(name);
    if (grant === undefined) return;
    if (grant.projectIds.includes(projectId)) return;
    await this.db.daemonGrant.update({
      where: { name },
      data: { projectIds: { push: projectId } },
    });
  }
}
