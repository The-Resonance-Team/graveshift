import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { applyDaemonEvent } from './data/incident-cache';
import type { DaemonEvent } from './types';

export type LiveState = 'connecting' | 'live' | 'reconnecting';

// Narrow view of the browser EventSource, so the root (non-DOM) typecheck agrees with the app one.
interface LiveSource {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
  onerror: (() => void) | null;
}
type LiveSourceCtor = new (url: string) => LiveSource;

export const backoffMs = (attempt: number): number => Math.min(30_000, 1000 * 2 ** attempt);

// SSE from the daemon. On error: close, wait with backoff, reconnect, then refetch everything once.
export function useLive(): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');
  useEffect(() => {
    let source: LiveSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const onEvent = (message: { data?: unknown }) => {
      try {
        applyDaemonEvent(qc, JSON.parse(String(message.data)) as DaemonEvent);
      } catch {
        // a malformed event is skipped; the next refetch repairs the cache
      }
    };
    const connect = () => {
      const Source = (globalThis as unknown as { EventSource: LiveSourceCtor }).EventSource;
      source = new Source('/api/events');
      source.addEventListener('hello', () => {
        if (attempt > 0) void qc.invalidateQueries();
        attempt = 0;
        setState('live');
      });
      source.addEventListener('incident', onEvent);
      source.addEventListener('timeline', onEvent);
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        setState('reconnecting');
        timer = setTimeout(connect, backoffMs(attempt));
        attempt += 1;
      };
    };
    connect();
    return () => {
      stopped = true;
      source?.close();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);
  return state;
}
