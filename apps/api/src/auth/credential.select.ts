import type { Prisma } from '@prisma/client';

const metadata = {
  id: true,
  kind: true,
  name: true,
  scopes: true,
  service: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  expirationAuditedAt: true,
} satisfies Prisma.CredentialSelect;

export const CREDENTIAL_SELECT = {
  metadata,
  verify: {
    ...metadata,
    projectId: true,
    clientId: true,
    prefix: true,
    hash: true,
  } satisfies Prisma.CredentialSelect,
};
