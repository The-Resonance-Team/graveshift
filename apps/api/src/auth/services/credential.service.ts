import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
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
const MAX_ACTIVE_CREDENTIALS = 10;
const MAX_CLIENT_INDEX = 1000;

/** The one issuer and verifier for MCP tokens and plugin API keys. */
@Injectable()
export class CredentialService {
  private lock: Promise<unknown> = Promise.resolve();
  private readonly clientIndex = new Map<string, string>();

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
    if (dto.kind === 'mcp' && dto.service) {
      throw new BadRequestException('An MCP token cannot have a service binding');
    }

    // The count and the add must run as one operation, or parallel issues
    // all see a free slot.
    return this.withLock(async () => {
      const active = (await this.repo.list()).filter(
        (record) =>
          record.clientId === principal.clientId &&
          record.tenantId === principal.tenantId &&
          this.isActive(record),
      );
      if (active.length >= MAX_ACTIVE_CREDENTIALS) {
        throw new ConflictException('The active credential limit is reached');
      }

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
      this.remember(value, record);
      await this.repo.add(record);
      // The value is returned once. It is never stored, logged or listed again.
      return { ...this.toMetadata(record), prefix: record.prefix, value };
    });
  }

  async verify(value: string, expectedKind?: CredentialKind): Promise<VerifiedCredential> {
    if (!value || value.length < 32) throw new UnauthorizedException();
    // SHA-256 over a 256-bit random token has no brute-force risk. We still compare
    // every candidate hash in constant time and never stop at the first match.
    const hash = digest(value);
    const records = await this.repo.list();
    let record: CredentialRecord | undefined;
    for (const candidate of records) {
      if (this.hashEquals(candidate.hash, hash)) record = candidate;
    }
    if (!record) throw new UnauthorizedException();
    if (!this.isActive(record)) throw new UnauthorizedException();
    if (expectedKind && record.kind !== expectedKind) throw new UnauthorizedException();
    this.remember(value, record);
    return {
      id: record.id,
      clientId: record.clientId,
      tenantId: record.tenantId,
      scopes: record.scopes,
      kind: record.kind,
      service: record.service,
    };
  }

  async list(principal: Principal): Promise<CredentialMetadata[]> {
    const records = await this.repo.list();
    return records
      .filter(
        (record) =>
          record.clientId === principal.clientId && record.tenantId === principal.tenantId,
      )
      .map((record) => this.toMetadata(record));
  }

  async revoke(id: string, principal: Principal): Promise<void> {
    const record = await this.repo.findById(id);
    if (
      !record ||
      record.clientId !== principal.clientId ||
      record.tenantId !== principal.tenantId
    ) {
      throw new NotFoundException();
    }
    if (record.revokedAt === null) {
      await this.repo.replace({ ...record, revokedAt: new Date().toISOString() });
    }
  }

  /** Sync lookup for the throttler. Only hashes and client ids are kept. */
  clientIdForKey(value: string): string | undefined {
    return this.clientIndex.get(digest(value));
  }

  private remember(value: string, record: CredentialRecord): void {
    if (this.clientIndex.size >= MAX_CLIENT_INDEX) {
      const oldest = this.clientIndex.keys().next().value;
      if (oldest) this.clientIndex.delete(oldest);
    }
    this.clientIndex.set(digest(value), `${record.tenantId}:${record.clientId}`);
  }

  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const result = this.lock.then(task, task);
    this.lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private isActive(record: CredentialRecord): boolean {
    return (
      record.revokedAt === null &&
      (record.expiresAt === null || Date.parse(record.expiresAt) > Date.now())
    );
  }

  private hashEquals(left: string, right: string): boolean {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && a.length === 32 && timingSafeEqual(a, b);
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
