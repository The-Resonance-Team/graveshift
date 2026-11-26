// Fingerprint: packages/actuator/runtimeDecision/zeroed-policy-usage
const LEAD = 'packages/actuator/runtimeDecision/zeroed-policy-usage';

function emit(verdict: string, observed: Record<string, unknown>, reason: string) {
  console.log(JSON.stringify({ lead: LEAD, verdict, observed, reason }));
}

try {
  const [{ runtimeDecision }, { decide }] = await Promise.all([
    import('/target/packages/actuator/src/claims.ts'),
    import('/target/packages/policy/src/decide.ts'),
  ]);

  // Real high recorded usage supplied by a fake collaborator (no live service).
  const recordedUsage = {
    openPrsLastHour: 2,
    actionsLast10Min: 7,
    diagnosisLoops: 50,
    llmSpentTodayUsd: 100,
  };
  const fakeCollaborator = {
    counters() {
      return { ...recordedUsage };
    },
    policyContext() {
      return {
        service: 'svc-a',
        category: 'code_bug',
        signals: ['sig-1'],
        confidence: 0.9,
        counters: { ...recordedUsage },
      };
    },
  };

  // Act-mode policy with positive diagnosis-loop and daily-spend limits.
  const policy = {
    version: 1,
    mode: 'act',
    approvers: { discordUserIds: ['dummy-approver'], discordRoleIds: [] },
    limits: {
      maxOpenPrsPerHour: 10,
      maxActionsPerServicePer10Min: 100,
      maxDiagnosisLoops: 3,
      llmDailyBudgetUsd: 10,
    },
    llm: { minConfidenceForPr: 0.5, minConfidenceForAction: 0.5 },
    github: { repos: [] },
    rules: [
      { id: 'allow-restart', action: 'restart_service', when: { services: ['svc-a'] }, effect: 'allow' },
    ],
    default: 'deny',
  };

  // Signed-shaped action / approval / context (dummy ids and fake signature).
  const request = {
    action: {
      id: 'act-dummy-1',
      incidentId: 'inc-dummy-1',
      service: 'svc-a',
      runtime: 'docker',
      kind: 'restart',
    },
    approval: {
      tokenId: 'tok-dummy-1',
      actionId: 'act-dummy-1',
      incidentId: 'inc-dummy-1',
      approvedBy: 'dummy-approver',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T00:14:00.000Z',
    },
    context: { category: 'code_bug', signals: ['sig-1'], confidence: 0.9 },
    signature: 'a'.repeat(64),
  };

  // runtimeDecision only forwards actionsLast10Min; diagnosisLoops and spend
  // are hard-coded to 0 inside it, regardless of the collaborator's real usage.
  const runtimeReason = runtimeDecision(policy as any, request as any, fakeCollaborator.counters().actionsLast10Min);

  // Same facts through the full SharedPolicyContext limit gate.
  const fullContext = fakeCollaborator.policyContext();
  const fullDecision = decide(policy as any, fullContext as any, { name: 'restart_service' });

  const fullDenied = fullDecision.effect === 'deny' && fullDecision.reason === 'rate_limited';
  const runtimeBypassed = runtimeReason === undefined;
  const confirmed = fullDenied && runtimeBypassed;

  emit(
    confirmed ? 'confirmed' : 'inconclusive',
    {
      recordedUsage,
      policyLimits: policy.limits,
      runtimeDecisionCounters: {
        openPrsLastHour: 0,
        actionsLast10Min: fakeCollaborator.counters().actionsLast10Min,
        diagnosisLoops: 0,
        llmSpentTodayUsd: 0,
      },
      runtimeDecisionReason: runtimeReason ?? null,
      fullContextCounters: fullContext.counters,
      fullContextDecision: {
        effect: fullDecision.effect,
        reason: fullDecision.reason,
        matchedRule: fullDecision.matchedRule,
      },
      fullContextDenied: fullDenied,
      runtimeBypassed,
    },
    confirmed
      ? 'The full SharedPolicyContext is denied as rate_limited by the positive diagnosisLoops/daily-spend limits, but runtimeDecision returns no denial because it zeroes diagnosisLoops and llmSpentTodayUsd.'
      : fullDenied
        ? 'The full context denied, but runtimeDecision also returned a denial; cannot confirm bypass.'
        : 'The full context did not deny as rate_limited; the comparison precondition was not met.',
  );
} catch (error) {
  emit('inconclusive', { error: String(error), stack: (error as Error)?.stack }, 'Import or execution failed; cannot establish the result.');
}
