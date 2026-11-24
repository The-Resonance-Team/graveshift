import type { AgentConfig } from '@graveshift/agents';
import type { PrRef } from '@graveshift/core';
import type {
  FixAttempt,
  FixFailure,
  PublicationIntent,
  WorkCaller,
  WorkSnapshot,
} from '@graveshift/work';

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

// The executor seam carries work-level failures only. The fixer adapter translates
// its own faults into this one vocabulary; no caller classifies fixer errors again.
export class FixExecutionError extends Error {
  readonly failure: Exclude<FixFailure, 'none'>;
  readonly reference?: PrRef;

  constructor(failure: Exclude<FixFailure, 'none'>, message: string, reference?: PrRef) {
    super(message);
    this.failure = failure;
    if (reference !== undefined) this.reference = reference;
  }
}
