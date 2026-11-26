// Fingerprint: apps/api/src/mcp/mcp.tools.ts:incident-read-embeds-diagnosis
const LEAD = 'apps/api/src/mcp/mcp.tools.ts:incident-read-embeds-diagnosis';

function emit(verdict: string, observed: Record<string, unknown>, reason: string) {
  console.log(JSON.stringify({ lead: LEAD, verdict, observed, reason }));
}

// Nest's legacy method decorators (@Tool) require experimentalDecorators. The
// runner invokes bun without that option, so re-exec once with the target
// package's own tsconfig as an override, using an in-process env marker.
if (!process.env.GSH_MCP_LEGACY_DECORATORS) {
  const child = Bun.spawn(
    [
      'bun',
      '--tsconfig-override',
      '/target/apps/api/tsconfig.json',
      process.argv[1]!,
    ],
    {
      env: { ...process.env, GSH_MCP_LEGACY_DECORATORS: '1' } as Record<string, string>,
      stdout: 'pipe',
      stderr: 'inherit',
    },
  );
  const out = await new Response(child.stdout).text();
  const code = await child.exited;
  if (out.trim().startsWith('{')) process.stdout.write(out);
  else
    console.log(
      JSON.stringify({
        lead: LEAD,
        verdict: 'inconclusive',
        observed: { childExit: code, childStdout: out.slice(0, 500) },
        reason: 'Re-exec with the target tsconfig produced no contract-shaped JSON.',
      }),
    );
  process.exit(out.trim().startsWith('{') ? code : 1);
}

try {
  const [{ McpTools }, perms] = await Promise.all([
    import('/target/apps/api/src/mcp/mcp.tools.ts'),
    import('/target/apps/api/src/mcp/mcp.permissions.ts'),
  ]);

  // A unique, deliberately nonsecret marker. It contains no detector pattern
  // (no '=', no secret keywords, and it is shorter than the 32-char entropy token).
  const SENTINEL = 'DIAG_SENTINEL_ZZTOP_42';

  const haunting = {
    incident: {
      id: 'inc-dummy-1',
      service: 'svc-a',
      state: 'open',
      signalIds: ['sig-1'],
      diagnosis: {
        id: 'diag-dummy-1',
        incidentId: 'inc-dummy-1',
        rootCause: `root cause marker ${SENTINEL}`,
        evidence: [{ ref: 'ev-dummy-1', excerpt: 'dummy evidence' }],
        confidence: 0.9,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      openedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    severity: 'high',
    category: 'code_bug',
    detections: [{ rule: 'sig-1' }],
    timeline: [],
    deploymentEnvironment: 'dummy-env',
  };

  // Fake backend + fake audit writer; deny-first policy; undefined envMode.
  const backend = {
    async listServices() {
      return [];
    },
    async listIncidents() {
      return [haunting];
    },
    async getIncident(_id: string) {
      return haunting;
    },
    async listAudit() {
      return [];
    },
    async verifyChain() {
      return { ok: true };
    },
    async tailLogs() {
      return [];
    },
    async queryMetric() {
      return null;
    },
    async getCounters() {
      return {
        counters: {
          openPrsLastHour: 0,
          actionsLast10Min: 0,
          diagnosisLoops: 0,
          llmSpentTodayUsd: 0,
        },
        source: 'wired',
      };
    },
    async policyContext() {
      return {
        service: 'svc-a',
        signals: ['sig-1'],
        confidence: 0.9,
        counters: {
          openPrsLastHour: 0,
          actionsLast10Min: 0,
          diagnosisLoops: 0,
          llmSpentTodayUsd: 0,
        },
      };
    },
  };
  const writer = {
    requireProject() {},
    async auditDecision() {
      return { acknowledged: true, key: 'dummy-key' };
    },
  };
  const policy = {
    version: 1,
    mode: 'propose',
    approvers: { discordUserIds: [], discordRoleIds: [] },
    limits: {
      maxOpenPrsPerHour: 0,
      maxActionsPerServicePer10Min: 0,
      maxDiagnosisLoops: 0,
      llmDailyBudgetUsd: 0,
    },
    llm: { minConfidenceForPr: 1, minConfidenceForAction: 1 },
    github: { repos: [] },
    rules: [{ id: 'deny-all', action: '*', effect: 'deny' }],
    default: 'deny',
  };

  const tools = new McpTools(backend as any, writer as any, policy as any, undefined);

  // Call both incident-read primitives directly; neither is a diagnosis primitive.
  const listResult: any = await tools.listIncidents({ limit: 20 });
  const getResult: any = await tools.getIncident({ id: 'inc-dummy-1' });

  const listHasSentinel = JSON.stringify(listResult).includes(SENTINEL);
  const getHasSentinel = JSON.stringify(getResult).includes(SENTINEL);
  const diagnosisText =
    listResult?.[0]?.incident?.diagnosis?.rootCause ?? getResult?.incident?.diagnosis?.rootCause;

  // Scope map evidence from mcp.permissions.ts via its public predicate.
  const permission = {
    get_incident_with_incidents_read: perms.canCallPrimitive('get_incident', ['incidents:read']),
    get_incident_with_diagnoses_read: perms.canCallPrimitive('get_incident', ['diagnoses:read']),
    get_diagnosis_with_incidents_read: perms.canCallPrimitive('get_diagnosis', ['incidents:read']),
    get_diagnosis_with_diagnoses_read: perms.canCallPrimitive('get_diagnosis', ['diagnoses:read']),
  };

  const scopeSeparation =
    permission.get_incident_with_incidents_read === true &&
    permission.get_incident_with_diagnoses_read === false &&
    permission.get_diagnosis_with_diagnoses_read === true &&
    permission.get_diagnosis_with_incidents_read === false;

  const embedded = listHasSentinel && getHasSentinel;
  const confirmed = embedded && scopeSeparation;

  emit(
    confirmed ? 'confirmed' : 'inconclusive',
    {
      sentinel: SENTINEL,
      listIncidentsHasSentinel: listHasSentinel,
      getIncidentHasSentinel: getHasSentinel,
      returnedDiagnosisText: diagnosisText,
      permission,
      scopeSeparation,
      envMode: null,
    },
    confirmed
      ? 'Both list_incidents and get_incident return the diagnosis root-cause sentinel. The permission map separates get_incident (incidents:read) from get_diagnosis (diagnoses:read), yet incident reads carry diagnosis content with no scope-aware projection.'
      : scopeSeparation
        ? 'The permission map is scope-separated, but the diagnosis sentinel did not survive deepRedact in one or both incident-read results; cannot confirm embedding.'
        : 'Could not establish the scope separation from canCallPrimitive; the permission evidence is unexpected.',
  );
} catch (error) {
  emit('inconclusive', { error: String(error), stack: (error as Error)?.stack }, 'Import or execution failed; cannot establish the result.');
}
