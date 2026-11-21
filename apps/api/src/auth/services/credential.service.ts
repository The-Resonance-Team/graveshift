import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  CREDENTIAL_CONFIG,
  CREDENTIAL_REPO,
  type AuthConfig,
  type CredentialMetadata,
  type CredentialRecord,
  type IssuedCredential,
  type Principal,
  type VerifiedCredential,
} from '../auth.types';
import type { CreateCredentialDto } from '../dto/create-credential.dto';
import { CredentialRepo } from '../repo/credential.repo';
import { FORBIDDEN_SCOPES, type CredentialKind, scopesForKind } from '../scopes';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** The one issuer and verifier for MCP tokens and plugin API keys. */
@Injectable()
export class CredentialService {
  constructor(
    @Inject(CREDENTIAL_REPO) private readonly repo: CredentialRepo,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
  ) {}

  async issue(dto: CreateCredentialDto, principal: Principal): Promise<IssuedCredential> {
    // The kind fixes the allowed scope set. The client grants only what it holds.
    const allowed = scopesForKind(dto.kind);
    const forbidden = FORBIDDEN_SCOPES as readonly string[];
    const accepted =
      dto.scopes.length > 0 &&
      dto.scopes.every(
        (scope) =>
          allowed.includes(scope) && !forbidden.includes(scope) && principal.scopes.includes(scope),
      );
    if (!accepted) throw new ForbiddenException('The requested scopes are not allowed');

    const value = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const ttl = dto.ttlSeconds ?? this.config.defaultTtlSeconds;
    const record: CredentialRecord = {
      id: randomUUID(),
      kind: dto.kind,
      name: dto.name,
      prefix: `${dto.kind}_${value.slice(0, 8)}`,
      hash: digest(value),
      clientId: principal.clientId,
      tenantId: principal.tenantId,
      scopes: [...dto.scopes],
      service: dto.service ?? null,
      createdAt: now,
      expiresAt: new Date(
        Date.now() + Math.min(ttl, this.config.maxTtlSeconds) * 1000,
      ).toISOString(),
      revokedAt: null,
    };
    await this.repo.add(record);

    // The value is returned once. It is never stored, logged or listed again.
    return { ...this.toMetadata(record), prefix: record.prefix, value };
  }

  async verify(value: string, expectedKind?: CredentialKind): Promise<VerifiedCredential> {
    if (!value || value.length < 32) throw new UnauthorizedException();
    const hash = digest(value);
    const record = await this.repo.findByHash(hash);
    if (!record) throw new UnauthorizedException();
    if (record.revokedAt !== null) throw new UnauthorizedException();
    if (record.expiresAt !== null && Date.parse(record.expiresAt) <= Date.now()) {
      throw new UnauthorizedException();
    }
    if (expectedKind && record.kind !== expectedKind) throw new UnauthorizedException();

    const actual = Buffer.from(hash, 'hex');
    const expected = Buffer.from(record.hash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException();
    }
    return {
      id: record.id,
      clientId: record.clientId,
      tenantId: record.tenantId,
      scopes: record.scopes,
      kind: record.kind,
      service: record.service,
    };
  }

  async list(clientId: string): Promise<CredentialMetadata[]> {
    const records = await this.repo.list();
    return records
      .filter((record) => record.clientId === clientId)
      .map((record) => this.toMetadata(record));
  }

  async revoke(id: string, clientId: string): Promise<void> {
    const record = await this.repo.findById(id);
    if (!record || record.clientId !== clientId) throw new NotFoundException();
    if (record.revokedAt === null) {
      await this.repo.replace({ ...record, revokedAt: new Date().toISOString() });
    }
  }

  private toMetadata(record: CredentialRecord): CredentialMetadata {
    return {
      id: record.id,
      kind: record.kind,
      name: record.name,
      scopes: record.scopes,
      service: record.service,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    };
  }
}
