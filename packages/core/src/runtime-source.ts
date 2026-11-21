import { z } from 'zod';

import { SignalSchema } from './schemas';

const timestamp = z.iso.datetime();

export const ServiceInfoSchema = z.object({
  name: z.string().min(1),
  runtime: z.enum(['docker', 'k8s']),
  namespace: z.string().min(1).optional(),
});
export type ServiceInfo = z.infer<typeof ServiceInfoSchema>;

export const ServiceHealthSchema = z.object({
  service: z.string().min(1),
  status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
  checkedAt: timestamp,
  detail: z.string().optional(),
});
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

export const RuntimeEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('signal'), cursor: z.string().optional(), signal: SignalSchema }),
  z.object({ kind: z.literal('source_disconnected'), at: timestamp, reason: z.string() }),
  z.object({ kind: z.literal('source_reconnected'), at: timestamp, cursor: z.string().optional() }),
]);
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export interface RuntimeSource {
  listServices(): Promise<ServiceInfo[]>;
  watchEvents(cb: (event: RuntimeEvent) => void): Promise<() => void>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  getHealth(service: string): Promise<ServiceHealth>;
  close(): Promise<void>;
}
