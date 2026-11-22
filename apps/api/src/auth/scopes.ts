// One scope catalog serves MCP tokens, plugin API keys and the HTTP config routes.
export const MCP_READ_SCOPES = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
  'fix:propose',
] as const;

export const PLUGIN_SCOPES = ['events:publish'] as const;

// HTTP-only scopes for the read-only config routes. They never enter MCP tokens or
// plugin keys: scopesForKind and MCP_READ_SCOPES stay unchanged, and CredentialService
// issue rejects them for both credential kinds. The #63 issuer grants them to OAuth
// clients only, and a client can be issued only a scope it already holds.
export const HTTP_CONFIG_SCOPES = ['config:read', 'config:export'] as const;
export type HttpConfigScope = (typeof HTTP_CONFIG_SCOPES)[number];

export const ALL_SCOPES = [...MCP_READ_SCOPES, ...PLUGIN_SCOPES, ...HTTP_CONFIG_SCOPES] as const;

// A client cannot grant these scopes, even when its own access token has them.
export const FORBIDDEN_SCOPES = ['admin', 'tokens:manage'] as const;

export const MANAGEMENT_SCOPE = 'tokens:manage';
export const EVENTS_PUBLISH_SCOPE = 'events:publish';
export const CONFIG_READ_SCOPE = 'config:read';
export const CONFIG_EXPORT_SCOPE = 'config:export';

export type CredentialKind = 'mcp' | 'plugin';

export function scopesForKind(kind: CredentialKind): readonly string[] {
  return kind === 'mcp' ? MCP_READ_SCOPES : PLUGIN_SCOPES;
}
