import { AuditDraftSchema, GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

import * as claims from './claims';
import type { HttpFetch, RequiredAudit } from './types';

export class AuditTransportError extends GraveshiftError<
  'AUDIT_CONFIG' | 'AUDIT_UNAVAILABLE' | 'AUDIT_REJECTED' | 'AUDIT_ACK_INVALID'
> {}

export interface AuditHttpOptions {
  apiUrl: string;
  token: string;
  projectId: string;
  fetchFn?: HttpFetch;
}

const AckSchema = z.object({ key: z.string().min(1).max(200) });
const PLACEHOLDER = /placeholder|replace[-_ ]?me|change[-_ ]?me|your[-_ ]?(token|secret)|example/i;

function internalPost(options: AuditHttpOptions) {
  const { apiUrl, token, projectId, fetchFn = fetch } = options;
  if (token.length < 32 || token.trim() !== token || PLACEHOLDER.test(token)) {
    throw new AuditTransportError('AUDIT_CONFIG', 'Internal audit token must be configured');
  }
  if (!projectId.trim()) {
    throw new AuditTransportError('AUDIT_CONFIG', 'Audit project must be configured');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(apiUrl);
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new AuditTransportError('AUDIT_CONFIG', 'Internal audit URL must be HTTP or HTTPS');
  }

  return async (path: string, input: object): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchFn(new URL(path, endpoint), {
        method: 'POST',
        redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, ...input }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AuditTransportError('AUDIT_UNAVAILABLE', 'Required audit is unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new AuditTransportError('AUDIT_REJECTED', 'Required audit was not acknowledged');
    }
    try {
      return await response.json();
    } catch {
      throw new AuditTransportError('AUDIT_ACK_INVALID', 'Audit acknowledgement is invalid');
    }
  };
}

export function createAuditHttp(options: AuditHttpOptions): RequiredAudit {
  const post = internalPost(options);
  return async (draft) => {
    const parsed = AuditDraftSchema.safeParse(draft);
    if (!parsed.success) throw new AuditTransportError('AUDIT_REJECTED', 'Audit draft is invalid');
    const ack = AckSchema.safeParse(await post('/internal/audit', { draft: parsed.data }));
    if (ack.success && ack.data.key === draft.key) return ack.data;
    throw new AuditTransportError('AUDIT_ACK_INVALID', 'Audit acknowledgement is invalid');
  };
}

export function createAdmissionHttp(options: AuditHttpOptions): claims.RequiredAdmission {
  const post = internalPost(options);
  return {
    async claim(input) {
      const claim = claims.RuntimeClaimSchema.safeParse(input);
      if (!claim.success)
        throw new AuditTransportError('AUDIT_REJECTED', 'Runtime claim is invalid');
      const result = claims.ClaimResultSchema.safeParse(
        await post('/internal/actions/claim', { claim: claim.data }),
      );
      if (result.success) return result.data;
      throw new AuditTransportError(
        'AUDIT_ACK_INVALID',
        'Runtime claim acknowledgement is invalid',
      );
    },
    async complete(input) {
      const completion = claims.RuntimeCompletionSchema.safeParse(input);
      if (!completion.success)
        throw new AuditTransportError('AUDIT_REJECTED', 'Runtime completion is invalid');
      const result = claims.CompletionResultSchema.safeParse(
        await post('/internal/actions/complete', { completion: completion.data }),
      );
      if (result.success) return result.data;
      throw new AuditTransportError(
        'AUDIT_ACK_INVALID',
        'Runtime completion acknowledgement is invalid',
      );
    },
  };
}
