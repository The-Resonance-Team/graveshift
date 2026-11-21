import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

const id = z.string().min(1);
const timestamp = z.iso.datetime();

export const ActionSchema = z
  .object({
    id,
    incidentId: id,
    service: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
    runtime: z.enum(['docker', 'k8s']),
    kind: z.enum(['restart', 'scale']),
    replicas: z.number().int().min(0).optional(),
  })
  .superRefine((action, ctx) => {
    const scale = action.kind === 'scale';
    if (scale && (action.runtime !== 'k8s' || action.replicas === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'scale needs runtime k8s and replicas' });
    }
    if (!scale && action.replicas !== undefined)
      ctx.addIssue({ code: 'custom', message: 'restart takes no replicas' });
  });
export type Action = z.infer<typeof ActionSchema>;

export const ApprovalClaimsSchema = z.object({
  tokenId: id,
  actionId: id,
  incidentId: id,
  approvedBy: id,
  issuedAt: timestamp,
  expiresAt: timestamp,
});
export type ApprovalClaims = z.infer<typeof ApprovalClaimsSchema>;

export const ContextSchema = z.object({
  category: z.string().optional(),
  signals: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const UnsignedRequestSchema = z.object({
  action: ActionSchema,
  approval: ApprovalClaimsSchema,
  context: ContextSchema,
});
export type UnsignedRequest = z.infer<typeof UnsignedRequestSchema>;

export const ActionRequestSchema = UnsignedRequestSchema.extend({
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const TOKEN_TTL_MS = 15 * 60 * 1000;

export interface ActuationResult {
  status: 'executed' | 'denied' | 'failed';
  reason: string;
  audit: { actor: 'actuator'; type: string; incidentId?: string; payload: Record<string, unknown> };
}

export interface DockerRestarter {
  restart(service: string): Promise<void>;
}

export interface KubeWriter {
  rolloutRestart(namespace: string, name: string): Promise<void>;
  scale(namespace: string, name: string, replicas: number): Promise<void>;
}

export class ActuatorError extends GraveshiftError<'ACTUATOR_CONFIG' | 'ACTUATOR_BACKEND'> {}
