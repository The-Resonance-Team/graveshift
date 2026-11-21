import { z } from 'zod';

export const PriceSchema = z.object({ in: z.number().min(0), out: z.number().min(0) });

export const GatewayConfigSchema = z
  .object({
    globalDailyBudgetUsd: z.number().min(0),
    maxRetries: z.number().int().min(0),
    timeoutMs: z.number().int().positive(),
    priceTableUsdPer1M: z.record(z.string(), PriceSchema),
  })
  .strict();
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
