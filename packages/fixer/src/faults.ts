import { GraveshiftError } from '@graveshift/core';

import type { PrRef } from './types';

export type FixerFaultCode =
  | 'SOURCE_UNAVAILABLE'
  | 'STALE_BASE'
  | 'CHECK_FAILED'
  | 'SANDBOX_UNAVAILABLE';

export class FixerFault extends GraveshiftError<FixerFaultCode> {}

export type PublicationPhase = 'recovery' | 'blob' | 'tree' | 'commit' | 'branch' | 'draft';

export class PublicationError extends GraveshiftError<'PUBLICATION_FAILED'> {
  readonly reference?: PrRef;
  readonly phase: PublicationPhase;
  readonly uncertain: boolean;

  constructor(phase: PublicationPhase, uncertain: boolean, reference?: PrRef) {
    super('PUBLICATION_FAILED', `draft publication failed during ${phase}`);
    this.phase = phase;
    this.uncertain = uncertain;
    if (reference !== undefined) this.reference = reference;
  }
}
