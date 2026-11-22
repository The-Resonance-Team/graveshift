import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../infra/prisma.service';
import {
  IdentityConflictError,
  type AccountRecord,
  type DaemonGrantRecord,
  type OAuthClientRecord,
  type OrganizationRecord,
  type ProjectRecord,
} from '../identity.types';

type AccountRow = Awaited<ReturnType<PrismaService['account']['findUnique']>>;
type OrganizationRow = Awaited<ReturnType<PrismaService['organization']['findUnique']>>;
type ProjectRow = Awaited<ReturnType<PrismaService['project']['findUnique']>>;
type OAuthClientRow = Awaited<ReturnType<PrismaService['oAuthClient']['findUnique']>>;
type GrantRow = Awaited<ReturnType<PrismaService['daemonGrant']['findUnique']>>;

export function mapConflict(error: unknown, message: string): unknown {
  if (error instanceof IdentityConflictError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new IdentityConflictError(message);
  }
  return error;
}

export function toAccount(row: NonNullable<AccountRow>): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOrganization(row: NonNullable<OrganizationRow>): OrganizationRecord {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.toISOString() };
}

export function toProject(row: NonNullable<ProjectRow>): ProjectRecord {
  return {
    projectId: row.projectId,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOAuthClient(row: NonNullable<OAuthClientRow>): OAuthClientRecord {
  return {
    clientId: row.clientId,
    secretHash: row.secretHash,
    orgId: row.orgId,
    projectId: row.projectId,
    scopes: row.scopes,
  };
}

export function toGrant(row: NonNullable<GrantRow>): DaemonGrantRecord {
  return { id: row.id, name: row.name, projectIds: row.projectIds };
}
