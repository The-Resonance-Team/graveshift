import type { NatsPublisherHandle } from '@graveshift/events/nats';

import type { OAuthClientConfig } from './env.schema';
import type { CredentialKind } from './scopes';

export const CREDENTIAL_CONFIG = Symbol('CREDENTIAL_CONFIG');
export const CREDENTIAL_REPO = Symbol('CREDENTIAL_REPO');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
export const NATS_CONNECTOR = Symbol('NATS_CONNECTOR');

export type NatsConnector = (servers: string) => Promise<NatsPublisherHandle>;

export interface AuthConfig {
  credentialsPath: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  maxEventBytes: number;
  eventRateLimit: number;
  eventRateTtlMs: number;
  oauthClients: Record<string, OAuthClientConfig>;
}

export interface CredentialRecord {
  id: string;
  kind: CredentialKind;
  name: string;
  prefix: string;
  hash: string;
  clientId: string;
  tenantId: string;
  scopes: string[];
  service: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface Principal {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

export interface VerifiedCredential extends Principal {
  id: string;
  kind: CredentialKind;
  service: string | null;
}

export interface CredentialMetadata {
  id: string;
  kind: CredentialKind;
  name: string;
  scopes: string[];
  service: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface IssuedCredential extends CredentialMetadata {
  prefix: string;
  value: string;
}

export interface PrincipalRequest {
  user: Principal;
  pluginPrincipal?: VerifiedCredential;
}
