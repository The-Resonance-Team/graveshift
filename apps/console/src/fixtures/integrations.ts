import { projectScope, sampleFixture, SAMPLE_TIMESTAMPS } from './sample';

export interface PlannedIntegration {
  id: string;
  name: string;
  category: 'event_source' | 'source_control' | 'notification';
  status: 'connected' | 'disconnected' | 'attention_required';
  summary: string;
  credentialId: string | null;
  lastCheckedAt: string | null;
}

export const plannedIntegrations = [
  sampleFixture<PlannedIntegration>('integration-sentry', 'planned_demo', projectScope, {
    id: 'integration-sentry',
    name: 'Sentry event source',
    category: 'event_source',
    status: 'connected',
    summary: 'Sample connected state for an event source using credential metadata only.',
    credentialId: 'credential-plugin-sentry',
    lastCheckedAt: SAMPLE_TIMESTAMPS.anchor,
  }),
  sampleFixture<PlannedIntegration>('integration-github', 'planned_demo', projectScope, {
    id: 'integration-github',
    name: 'Source control',
    category: 'source_control',
    status: 'disconnected',
    summary: 'Sample disconnected state. No connection action is implemented by this fixture.',
    credentialId: null,
    lastCheckedAt: null,
  }),
  sampleFixture<PlannedIntegration>('integration-discord', 'planned_demo', projectScope, {
    id: 'integration-discord',
    name: 'Team notifications',
    category: 'notification',
    status: 'attention_required',
    summary: 'Sample state that asks a person to review notification settings.',
    credentialId: null,
    lastCheckedAt: SAMPLE_TIMESTAMPS.earlier,
  }),
] as const;
