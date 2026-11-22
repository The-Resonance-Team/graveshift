// One scope catalog serves MCP tokens, plugin API keys and HTTP-only routes.
export const MCP_READ_SCOPES = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
  'fix:propose',
] as const;

export const PLUGIN_SCOPES = ['events:publish'] as const;

// HTTP-only scopes for the config export and the work-item trigger routes. They never
// enter an MCP token or a plugin key: MCP_READ_SCOPES and PLUGIN_SCOPES stay unchanged,
// and scopesForKind does not grant them. The #63 issuer grants them to OAuth clients only,
// and a client can be issued only a scope it already holds.
export const HTTP_CONFIG_SCOPES = ['config:export'] as const;
export const HTTP_WORK_ITEM_SCOPES = ['fix:trigger'] as const;

export const ALL_SCOPES = [
  ...MCP_READ_SCOPES,
  ...PLUGIN_SCOPES,
  ...HTTP_CONFIG_SCOPES,
  ...HTTP_WORK_ITEM_SCOPES,
] as const;

// The scopes a credential of either kind can be issued with. The create-credential DTO
// advertises this list. fix:trigger is here for the HTTP trigger routes, but it stays out
// of MCP_READ_SCOPES and MCP_READ_SCOPE_ORDER, so no MCP primitive can use it.
export const CREDENTIAL_ISSUABLE_SCOPES = [
  ...MCP_READ_SCOPES,
  ...PLUGIN_SCOPES,
  ...HTTP_WORK_ITEM_SCOPES,
] as const;

// A client cannot grant these scopes, even when its own access token has them.
export const FORBIDDEN_SCOPES = ['admin', 'tokens:manage'] as const;

export const MANAGEMENT_SCOPE = 'tokens:manage';
export const EVENTS_PUBLISH_SCOPE = 'events:publish';
export const CONFIG_EXPORT_SCOPE = 'config:export';
export const FIX_TRIGGER_SCOPE = 'fix:trigger';

export type CredentialKind = 'mcp' | 'plugin';

export function scopesForKind(kind: CredentialKind): readonly string[] {
  return kind === 'mcp' ? MCP_READ_SCOPES : PLUGIN_SCOPES;
}
