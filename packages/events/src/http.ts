import { prepareEnvelope, type EventEnvelope } from '@graveshift/core';

import type { Publisher } from './index';

export interface HttpPublisherOptions {
  /** API origin, without a trailing slash. */
  baseUrl: string;
  apiKey: string;
  /** Inject a stub in tests. No network call is made when supplied. */
  fetch?: typeof fetch;
}

/** Posts envelopes to the API with a bearer plugin key. Client apps use this publisher. */
export function createHttpPublisher(options: HttpPublisherOptions): Publisher {
  const doFetch = options.fetch ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, '')}/api/events`;
  return {
    async publish(envelope: EventEnvelope): Promise<void> {
      const prepared = prepareEnvelope(envelope);
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(prepared),
      });
      if (response.status !== 202) {
        throw new Error(`Event ingest failed with status ${response.status}`);
      }
    },
  };
}
