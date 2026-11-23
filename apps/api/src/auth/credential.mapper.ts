import type { AuditDraft } from '@graveshift/core';
import type { Prisma } from '@prisma/client';

import type { CredentialMetadata, CredentialRecord } from './auth.types';
import type { CREDENTIAL_SELECT } from './credential.select';

type MetadataRow = Prisma.CredentialGetPayload<{ select: typeof CREDENTIAL_SELECT.metadata }>;
type VerifyRow = Prisma.CredentialGetPayload<{ select: typeof CREDENTIAL_SELECT.verify }>;

export function toMetadata(row: MetadataRow): CredentialMetadata {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    scopes: row.scopes,
    service: row.service,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export function toCredential(row: VerifyRow): CredentialRecord {
  return {
    ...toMetadata(row),
    prefix: row.prefix,
    hash: row.hash,
    clientId: row.clientId,
    projectId: row.projectId,
    expirationAuditedAt: row.expirationAuditedAt?.toISOString() ?? null,
  };
}

export function credentialAudit(
  record: CredentialRecord,
  event: 'issued' | 'revoked' | 'expired',
): AuditDraft {
  return {
    key: `credential:${record.id}:${event}`,
    actor: record.clientId,
    type: `credential.${event}`,
    payload: { credentialId: record.id, kind: record.kind, expiresAt: record.expiresAt },
  };
}
