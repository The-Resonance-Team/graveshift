export const keys = {
  graveyard: ['graveyard'] as const,
  incidents: ['incidents'] as const,
  incident: (id: string) => ['incidents', id] as const,
  mode: ['mode'] as const,
  audit: ['audit'] as const,
  chain: ['audit', 'chain'] as const,
};
