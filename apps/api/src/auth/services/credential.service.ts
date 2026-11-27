import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CREDENTIAL_CONFIG,
  CREDENTIAL_REPO,
  type AuthConfig,
  type CredentialMetadata,
  type CredentialRecord,
  type CredentialVerifier,
  type IssuedCredential,
  type Principal,
  type VerifiedCredential,
} from '../auth.types';
import type { CreateCredentialDto } from '../dto/create-credential.dto';
import {
  CredentialConflictError,
  CredentialLimitError,
  CredentialRepo,
} from '../repo/credential.repo';
import { FORBIDDEN_SCOPES, type CredentialKind, scopesForKind } from '../scopes';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** The one issuer and verifier for MCP tokens and plugin API keys. */
@Injectable()
export class CredentialService implements CredentialVerifier {
  constructor(
    @Inject(CREDENTIAL_REPO) private readonly repo: Pick<CredentialRepo, keyof CredentialRepo>,
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
    if (dto.kind === 'mcp' && dto.service !== undefined) {
      throw new ForbiddenException('An MCP token cannot have a service binding');
    }
    // A bound plugin Credential serves the Sentry route, which needs a numeric DSN project id.
    if (
      dto.kind === 'plugin' &&
      dto.service !== undefined &&
      !/^\d{1,20}$/.test(principal.projectId)
    ) {
      throw new UnprocessableEntityException(
        'A service-bound plugin credential needs an OAuth client with a numeric projectId',
      );
    }

    try {
      // Lowercase hex gives a 64-character value that a Sentry DSN accepts verbatim.
      const value = randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      const ttl = dto.ttlSeconds ?? this.config.defaultTtlSeconds;
      const record: CredentialRecord = {
        id: randomUUID(),
        kind: dto.kind,
        name: dto.name,
        prefix: `${dto.kind}_${value.slice(0, 8)}`,
        hash: digest(value),
        clientId: principal.clientId,
        projectId: principal.projectId,
        scopes: [...dto.scopes],
        service: dto.service ?? null,
        createdAt: now,
        expiresAt: new Date(
          Date.now() + Math.min(ttl, this.config.maxTtlSeconds) * 1000,
        ).toISOString(),
        revokedAt: null,
        expirationAuditedAt: null,
      };
      await this.repo.add(record);
      // The value is returned once. It is never stored, logged or listed again.
      return { ...this.toMetadata(record), prefix: record.prefix, value };
    } catch (error) {
      if (error instanceof CredentialLimitError || error instanceof CredentialConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async verify(value: string, expectedKind?: CredentialKind): Promise<VerifiedCredential> {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new UnauthorizedException();
    // SHA-256 over a 256-bit random token has no brute-force risk. We still compare
    // every candidate hash in constant time and never stop at the first match.
    const hash = digest(value);
    const candidate = await this.repo.findByHash(hash);
    const record = candidate && this.hashEquals(candidate.hash, hash) ? candidate : undefined;
    if (!record) throw new UnauthorizedException();
    if (!this.isActive(record)) {
      if (record.expiresAt !== null && record.revokedAt === null) {
        await this.repo.recordExpiry(record.id, new Date().toISOString());
      }
      throw new UnauthorizedException();
    }
    if (expectedKind && record.kind !== expectedKind) throw new UnauthorizedException();
    return {
      id: record.id,
      clientId: record.clientId,
      projectId: record.projectId,
      scopes: record.scopes,
      kind: record.kind,
      service: record.service,
      expiresAt: record.expiresAt,
    };
  }

  async list(principal: Principal): Promise<CredentialMetadata[]> {
    return (await this.repo.list(principal)).map((record) => this.toMetadata(record));
  }

  async revoke(id: string, principal: Principal): Promise<void> {
    if (!(await this.repo.revoke(id, principal, new Date().toISOString())))
      throw new NotFoundException();
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
