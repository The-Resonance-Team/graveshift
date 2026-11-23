import { redact } from '@graveshift/redactor';

import {
  AuditAcknowledgementError,
  type AuditSink,
  type GatewayResult,
  type GatewayTask,
} from './types';

export interface Decision<T> {
  result: GatewayResult<T>;
  reason?: string;
}

export async function acknowledge<T>(
  sink: AuditSink,
  task: GatewayTask<T>,
  { result, reason }: Decision<T>,
  model?: string,
): Promise<GatewayResult<T>> {
  try {
    const ack = await sink({
      callId: result.callId,
      agent: task.agent,
      task: task.task,
      status: result.status,
      tokensIn: result.usage.in,
      tokensOut: result.usage.out,
      costUsd: result.costUsd,
      ...(model === undefined ? {} : { model }),
      ...(reason === undefined ? {} : { reason: redact(reason) }),
    });
    if (ack?.callId !== result.callId) throw new AuditAcknowledgementError();
    return result;
  } catch {
    return {
      status: 'unavailable',
      reason: 'audit_unavailable',
      callId: result.callId,
      usage: result.usage,
      costUsd: result.costUsd,
    };
  }
}
