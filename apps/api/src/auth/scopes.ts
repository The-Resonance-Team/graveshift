// Simple scopes for the v3 identity model. Current scope strings stay accepted as
// aliases, so clients from PR #113 and PR #120 keep the same effective grants.
export const SIMPLE_SCOPES = [
  'org:read',
  'project:read',
  'project:write',
  'event:read',
  'org:ci',
] as const;

export const SCOPE_ALIASES: Record<string, string> = {
  'org:read': 'org:read',
  'project:read': 'project:read',
  'project:write': 'project:write',
  'event:read': 'event:read',
  'org:ci': 'org:ci',
  'incidents:read': 'project:read',
  'diagnoses:read': 'project:read',
  'audit:read': 'org:read',
  'logs:read': 'event:read',
  'metrics:read': 'project:read',
  'fix:propose': 'project:write',
  'events:publish': 'event:read',
  'config:export': 'config:export',
  'tokens:manage': 'tokens:manage',
};

/** Adds the canonical form and every alias with the same meaning to a scope set. */
export function expandScopes(scopes: readonly string[]): string[] {
  const result = new Set<string>(scopes);
  for (const scope of scopes) {
    const canonical = SCOPE_ALIASES[scope];
    if (canonical === undefined) continue;
    result.add(canonical);
    for (const [alias, target] of Object.entries(SCOPE_ALIASES)) {
      if (target === canonical) result.add(alias);
    }
  }
  return [...result];
}

// One scope catalog serves MCP tokens, plugin API keys and the one HTTP config endpoint.
export const MCP_READ_SCOPES = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
  'fix:propose',
] as const;

export const PLUGIN_SCOPES = ['events:publish'] as const;

// HTTP-only scope for the one config endpoint. It never enters an MCP token or a plugin
// key: scopesForKind and MCP_READ_SCOPES stay unchanged, and CredentialService.issue
// rejects it for every credential kind. The #63 issuer grants it to OAuth clients only,
// and a client can be issued only a scope it already holds.
export const HTTP_CONFIG_SCOPES = ['config:export'] as const;

export const ALL_SCOPES = [...MCP_READ_SCOPES, ...PLUGIN_SCOPES, ...HTTP_CONFIG_SCOPES] as const;

// The scopes a credential of either kind can be issued with. The request DTO advertises
// this list, not ALL_SCOPES: the HTTP-only config scopes are never issued as credentials.
export const CREDENTIAL_ISSUABLE_SCOPES = [...MCP_READ_SCOPES, ...PLUGIN_SCOPES] as const;

// A client cannot grant these scopes, even when its own access token has them.
export const FORBIDDEN_SCOPES = ['admin', 'tokens:manage'] as const;

export const MANAGEMENT_SCOPE = 'tokens:manage';
export const EVENTS_PUBLISH_SCOPE = 'events:publish';
export const CONFIG_EXPORT_SCOPE = 'config:export';

export type CredentialKind = 'mcp' | 'plugin';

export function scopesForKind(kind: CredentialKind): readonly string[] {
  return kind === 'mcp' ? MCP_READ_SCOPES : PLUGIN_SCOPES;
}
