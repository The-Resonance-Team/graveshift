import { api } from './client';
import type { AuditEntry, ChainStatus, Grave, IncidentView, ModeView } from './types';

export const fetchGraveyard = async () => (await api.get<Grave[]>('/api/graveyard')).data;
export const fetchIncidents = async () => (await api.get<IncidentView[]>('/api/incidents')).data;
export const fetchIncident = async (id: string) =>
  (await api.get<IncidentView>(`/api/incidents/${encodeURIComponent(id)}`)).data;
export const fetchMode = async () => (await api.get<ModeView>('/api/mode')).data;
export const fetchAudit = async () =>
  (await api.get<AuditEntry[]>('/api/audit', { params: { limit: 20 } })).data;
export const fetchChain = async () => (await api.get<ChainStatus>('/api/audit/verify')).data;

export type HauntResult =
  | { ok: true; scenario: string }
  | { ok: false; status: number; retryAfterSeconds?: number; message: string };

// The daemon answers 429 with Retry-After; the panel uses it for its cooldown.
export async function postHaunt(scenario: string): Promise<HauntResult> {
  const res = await api.post<{ error?: string }>(
    '/api/haunt',
    { scenario },
    { validateStatus: () => true },
  );
  if (res.status >= 200 && res.status < 300) return { ok: true, scenario };
  const retry = Number(res.headers['retry-after']);
  return {
    ok: false,
    status: res.status,
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
    message: res.data?.error ?? `request failed with ${res.status}`,
  };
}
