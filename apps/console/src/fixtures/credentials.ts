import { projectScope, sampleFixture, SAMPLE_TIMESTAMPS } from './sample';

export interface SampleCredentialMetadata {
  id: string;
  kind: 'mcp' | 'plugin';
  name: string;
  scopes: string[];
  service: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface SampleCredentialList {
  items: SampleCredentialMetadata[];
}

const mcpCredential: SampleCredentialMetadata = {
  id: 'credential-mcp-read',
  kind: 'mcp',
  name: 'Sample read-only MCP credential',
  scopes: ['incidents:read', 'diagnoses:read'],
  service: null,
  createdAt: SAMPLE_TIMESTAMPS.earlier,
  expiresAt: SAMPLE_TIMESTAMPS.expiry,
  revokedAt: null,
};

const pluginCredential: SampleCredentialMetadata = {
  id: 'credential-plugin-sentry',
  kind: 'plugin',
  name: 'Sample Sentry event credential',
  scopes: ['events:publish'],
  service: 'checkout-api',
  createdAt: SAMPLE_TIMESTAMPS.earlier,
  expiresAt: null,
  revokedAt: null,
};

const revokedCredential: SampleCredentialMetadata = {
  id: 'credential-revoked',
  kind: 'mcp',
  name: 'Sample revoked audit credential',
  scopes: ['audit:read'],
  service: null,
  createdAt: SAMPLE_TIMESTAMPS.earlier,
  expiresAt: null,
  revokedAt: SAMPLE_TIMESTAMPS.anchor,
};

const expiredCredential: SampleCredentialMetadata = {
  id: 'credential-expired',
  kind: 'plugin',
  name: 'Sample expired event credential',
  scopes: ['events:publish'],
  service: 'sandbox',
  createdAt: SAMPLE_TIMESTAMPS.earlier,
  expiresAt: SAMPLE_TIMESTAMPS.anchor,
  revokedAt: null,
};

export const sampleCredentials = [
  sampleFixture('credential-mcp-read', 'api_shaped', projectScope, mcpCredential),
  sampleFixture('credential-plugin-sentry', 'api_shaped', projectScope, pluginCredential),
  sampleFixture('credential-revoked', 'api_shaped', projectScope, revokedCredential),
  sampleFixture('credential-expired', 'api_shaped', projectScope, expiredCredential),
] as const;

export const sampleCredentialList = sampleFixture<SampleCredentialList>(
  'credential-list',
  'api_shaped',
  projectScope,
  { items: [mcpCredential, pluginCredential, revokedCredential, expiredCredential] },
);

export const emptyCredentialList = sampleFixture<SampleCredentialList>(
  'credential-list-empty',
  'api_shaped',
  projectScope,
  { items: [] },
);
