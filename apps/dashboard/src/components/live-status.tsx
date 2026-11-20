'use client';

import type { LiveState } from '../lib/use-live';

const COPY: Record<LiveState, { text: string; className: string }> = {
  connecting: { text: 'Connecting to live updates', className: 'text-fog' },
  live: { text: 'Live', className: 'text-ectoplasm' },
  reconnecting: { text: 'Reconnecting, data may be stale', className: 'text-pumpkin' },
};

export function LiveStatus({ state }: { state: LiveState }) {
  const { text, className } = COPY[state];
  return (
    <p role="status" className={`text-xs ${className}`}>
      {text}
    </p>
  );
}
