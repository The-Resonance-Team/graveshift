'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';

import type { LiveState } from '../lib/use-live';

const COPY: Record<LiveState, { text: string; variant: 'accent' | 'neutral' | 'warning' }> = {
  connecting: { text: 'Connecting to live updates', variant: 'neutral' },
  live: { text: 'Live', variant: 'accent' },
  reconnecting: { text: 'Reconnecting, data may be stale', variant: 'warning' },
};

export function LiveStatus({ state }: { state: LiveState }) {
  const { text, variant } = COPY[state];
  return (
    <HStack gap={1} vAlign="center" aria-live="polite">
      <StatusDot variant={variant} label={text} />
      <Text type="supporting">{text}</Text>
    </HStack>
  );
}
