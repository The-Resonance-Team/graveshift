import type { UIMessage } from 'ai';
import type { ChatToolCallItem } from '@astryxdesign/core/Chat';

import { plannedAgentPage, plannedArtifactPanel } from '../../fixtures/agent';

export type SampleMetadata = { origin: 'fixture' | 'local'; createdAt: string };
export type SampleMessage = UIMessage<SampleMetadata>;

export const sampleConversation = plannedAgentPage.payload.conversation;
export const sampleActivities = plannedAgentPage.payload.activities;
export const sampleArtifact = (() => {
  const artifact = plannedArtifactPanel.payload.artifacts[0];
  if (artifact === undefined) throw new Error('Missing planned artifact fixture');
  return artifact;
})();
export const sampleNotice = plannedAgentPage.notice;

export const fixtureMessages: SampleMessage[] = sampleConversation.map((message) => ({
  id: message.id,
  role: message.role === 'user' ? 'user' : 'assistant',
  parts: [{ type: 'text', text: message.body }],
  metadata: { origin: 'fixture', createdAt: message.createdAt },
}));

export function isLocalMessage(message: SampleMessage): boolean {
  return message.metadata?.origin === 'local';
}

export const sampleToolCalls: ChatToolCallItem[] = sampleActivities.map((activity) => ({
  name: `sample-${activity.kind}`,
  target: activity.label,
  status:
    activity.state === 'complete' ? 'complete' : activity.state === 'failed' ? 'error' : 'pending',
  resultDetail: activity.detail,
  key: activity.id,
}));
