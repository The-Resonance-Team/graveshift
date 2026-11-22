import { findEventType } from './events/events.types';

const READ_SCOPES = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
] as const;

const PRIMITIVES = new Map<string, string>([
  ['list_services', 'incidents:read'],
  ['list_incidents', 'incidents:read'],
  ['get_incident', 'incidents:read'],
  ['triage_incident', 'incidents:read'],
  ['write_postmortem', 'incidents:read'],
  ['postmortem', 'incidents:read'],
  ['get_diagnosis', 'diagnoses:read'],
  ['get_audit_log', 'audit:read'],
  ['verify_audit_chain', 'audit:read'],
  ['tail_logs', 'logs:read'],
  ['query_metric', 'metrics:read'],
  ['propose_fix', 'fix:propose'],
]);

const PROTOCOL = new Set(['initialize', 'ping', 'server/discover']);
const DISCOVERY = new Set([
  'tools/list',
  'prompts/list',
  'resources/list',
  'resources/templates/list',
]);
// v2 is poll-only. Push and subscription methods belong to v3 and deny by default.
const AUTHENTICATED_EVENTS = new Set(['events/list']);

export function canCallPrimitive(name: string | undefined, scopes: readonly string[]): boolean {
  const required = name === undefined ? undefined : PRIMITIVES.get(name);
  return required !== undefined && scopes.includes(required);
}

export function canCallMcpMethod(call: unknown, scopes: readonly string[]): boolean {
  if (
    typeof call !== 'object' ||
    call === null ||
    !('method' in call) ||
    typeof call.method !== 'string'
  ) {
    return false;
  }
  const method = call.method;
  if (PROTOCOL.has(method) || method.startsWith('notifications/')) return true;
  if (DISCOVERY.has(method)) return READ_SCOPES.some((scope) => scopes.includes(scope));
  if (AUTHENTICATED_EVENTS.has(method)) return true;

  const params =
    'params' in call && typeof call.params === 'object' && call.params !== null
      ? call.params
      : undefined;
  const name =
    params && 'name' in params && typeof params.name === 'string' ? params.name : undefined;
  if (method === 'tools/call' || method === 'prompts/get') {
    return canCallPrimitive(name, scopes);
  }
  if (method === 'events/poll') {
    const type = name === undefined ? undefined : findEventType(name);
    // The Events module reports malformed or unknown types before reading data.
    return type === undefined || scopes.includes(type.scope);
  }
  if (method === 'resources/read') {
    const uri = params && 'uri' in params && typeof params.uri === 'string' ? params.uri : '';
    return (
      uri.startsWith('graveshift://incidents/') &&
      uri.endsWith('/postmortem') &&
      scopes.includes('incidents:read')
    );
  }
  return false;
}
