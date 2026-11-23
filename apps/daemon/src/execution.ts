import type { AgentConfig } from '@graveshift/agents';
import type { PrRef } from '@graveshift/core';
import type { FixAttempt, PublicationIntent, WorkCaller, WorkSnapshot } from '@graveshift/work';

import type { FixContext } from './fix-context';

export interface ExecutionInput {
  caller: WorkCaller;
  snapshot: WorkSnapshot;
  attempt: FixAttempt;
  context: FixContext;
  agent: AgentConfig;
  prompt: string;
  signal?: AbortSignal;
}

export interface PreparedFix {
  intent: PublicationIntent;
  publish(): Promise<PrRef>;
  dispose(): Promise<void>;
}

export type FixExecutor = (input: ExecutionInput) => Promise<PreparedFix>;

export class ExecutionFailure extends Error {
  readonly failure: 'patch_rejected' | 'audit_failed' | 'fix_error';
  constructor(failure: 'patch_rejected' | 'audit_failed' | 'fix_error', message: string) {
    super(message);
    this.failure = failure;
  }
}
