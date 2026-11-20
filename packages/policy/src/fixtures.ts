import type { PolicyContext } from './decide';
import { parsePolicy } from './load';
import type { Policy } from './schema';

export const basePolicy: Policy = parsePolicy({
  version: 1,
  mode: 'act',
  approvers: { discordUserIds: ['1'], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 3,
    maxActionsPerServicePer10Min: 1,
    maxDiagnosisLoops: 2,
    llmDailyBudgetUsd: 2,
  },
  llm: { minConfidenceForPr: 0.6, minConfidenceForAction: 0.75 },
  github: { repos: [] },
  rules: [],
  default: 'deny',
});

export const baseContext: PolicyContext = {
  service: 'api',
  category: 'code_bug',
  signals: ['oom_killed'],
  confidence: 1,
  counters: { openPrsLastHour: 0, actionsLast10Min: 0, diagnosisLoops: 0, llmSpentTodayUsd: 0 },
};
