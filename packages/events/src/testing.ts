import type { EventEnvelope } from '@graveshift/core';

import type { Publisher } from './index';

export interface InMemoryPublisher extends Publisher {
  readonly envelopes: EventEnvelope[];
}

/** Captures envelopes in memory for tests. No NATS server is used. */
export function createInMemoryPublisher(): InMemoryPublisher {
  const envelopes: EventEnvelope[] = [];
  return {
    envelopes,
    async publish(envelope) {
      envelopes.push(envelope);
    },
  };
}
