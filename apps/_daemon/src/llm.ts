import { loadConfigFile } from '@graveshift/core';
import {
  type AuditEvent,
  buildProviders,
  createGateway,
  type LlmConfig,
  LlmConfigSchema,
} from '@graveshift/llm';

// One gateway wiring for the daemon and the real-model harness.
export async function createDiagnosisGateway(
  configPath: string,
  env: Record<string, string | undefined>,
  dailyBudgetUsd: number,
  onAudit?: (event: AuditEvent) => void,
): Promise<{ gateway: ReturnType<typeof createGateway>; llmConfig: LlmConfig | undefined }> {
  const llmConfig: LlmConfig | undefined = await loadConfigFile(configPath)
    .then((c) => LlmConfigSchema.parse(c.llm))
    .catch(() => undefined);
  return {
    llmConfig,
    gateway: createGateway({
      providers: llmConfig ? buildProviders(llmConfig, env) : [],
      config: llmConfig ?? { timeoutMs: 30_000, maxRetries: 0, priceTableUsdPer1M: {} },
      dailyBudgetUsd,
      ...(onAudit ? { onAudit } : {}),
    }),
  };
}
