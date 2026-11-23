import type { GitHubClient } from './client';

export type PrEvent =
  | { type: 'checks'; state: 'pending' | 'success' | 'failure'; total: number }
  | { type: 'merged_externally' }
  | { type: 'closed' };

/** Watching needs only the coordinates of one pull request, never its stamp. */
export interface WatchTarget {
  repo: string;
  number: number;
}

export interface WatchOptions {
  client: GitHubClient;
  pr: WatchTarget;
  onEvent: (event: PrEvent) => void;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function checkState(
  runs: Array<{ status: string; conclusion: string | null }>,
): 'pending' | 'success' | 'failure' {
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  const bad = ['failure', 'cancelled', 'timed_out', 'action_required'];
  if (runs.some((r) => r.conclusion !== null && bad.includes(r.conclusion))) return 'failure';
  return 'success';
}

// Polls every 30 s. It only reads: a merge is detected, never performed.
export function watchPr({
  client,
  pr,
  onEvent,
  intervalMs = 30_000,
  sleep = Bun.sleep,
}: WatchOptions): () => void {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const state = await client.getPullRequest(pr.repo, pr.number);
      if (state.merged) return onEvent({ type: 'merged_externally' });
      if (state.state === 'closed') return onEvent({ type: 'closed' });
      const runs = await client.listCheckRuns(pr.repo, state.headSha);
      onEvent({ type: 'checks', state: checkState(runs), total: runs.length });
    } catch {
      // a failed poll is retried on the next interval
    }
    await sleep(intervalMs);
    if (!stopped) void tick();
  };
  void tick();
  return () => {
    stopped = true;
  };
}
