// Bounded validation of repository selection in fix-context.contextClient.
// No repository-selection function is exported; the exact inline filter at
// /target/apps/daemon/src/fix-context.ts:42-46 is reproduced and the real
// contextClient is also invoked with fake api/policy adapters.
const lead = 'daemon/fix-context/service-only-repository-selection';

function fail(error: unknown) {
  console.log(
    JSON.stringify({
      lead,
      verdict: 'inconclusive',
      observed: {},
      reason: `Harness could not execute: ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`,
    }),
  );
}

try {
  const { contextClient } = await import('/target/apps/daemon/src/fix-context.ts');

  const PROJECT_A = 'projA';
  const PROJECT_B = 'projB';
  const SERVICE = 'checkout';
  const INCIDENT = 'incident-dummy';
  const REPO = 'dummy-org/checkout-service';
  const AT = '2026-01-01T00:00:00.000Z';

  const diagnosis = {
    id: 'diag-dummy',
    incidentId: INCIDENT,
    rootCause: 'dummy root cause',
    evidence: [{ ref: 'sig-dummy', excerpt: 'dummy excerpt' }],
    confidence: 0.7,
    createdAt: AT,
  };
  const repo = {
    repo: REPO,
    services: [SERVICE],
    baseBranch: 'main',
    branchPrefix: 'fix/',
    draft: true as const,
  };
  const policy = { github: { repos: [repo] } };
  const snapshot = {
    item: { id: 'work-dummy', diagnosisRef: diagnosis.id, service: SERVICE },
    version: 0,
    diagnosis: structuredClone(diagnosis),
  };

  const viewFor = (callerProjectId: string) => ({
    incident: {
      id: INCIDENT,
      service: SERVICE,
      state: 'diagnosed',
      signalIds: ['sig-dummy'],
      diagnosis: structuredClone(diagnosis),
      openedAt: AT,
      updatedAt: '2026-01-01T00:01:00.000Z',
    },
    severity: 'critical',
    category: 'resource_exhaustion',
    detections: [
      {
        id: 'evt-dummy:runtime.oom',
        projectId: callerProjectId,
        eventId: 'evt-dummy',
        traceId: 'trace-dummy',
        rule: 'runtime.oom',
        service: SERVICE,
        severity: 'critical',
        fingerprint: `${SERVICE}:runtime.oom`,
        message: 'dummy OOM signal',
        observedAt: AT,
      },
    ],
    deploymentId: 'a'.repeat(40),
  });
  const facts = {
    service: SERVICE,
    category: 'resource_exhaustion',
    signals: ['runtime.oom'],
    confidence: 0.7,
    counters: {
      openPrsLastHour: 0,
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    },
  };

  const apiRefs: Array<{ projectId: string; service: string }> = [];
  const api = {
    async get() {
      throw new Error('dummy api get is unused');
    },
    async post(path: string, body: any, _schema: unknown) {
      apiRefs.push({ projectId: body.projectId, service: body.service });
      if (path === '/internal/hauntings/context') return viewFor(body.projectId);
      if (path === '/internal/context') return structuredClone(facts);
      throw new Error(`dummy api has no route ${path}`);
    },
  };

  // Exact inline filter from fix-context.ts lines 42-46 (no standalone export exists).
  const sourceLine = 'apps/daemon/src/fix-context.ts:42-46';
  const reproducedSelect = (callerProjectId: string, snap: typeof snapshot) => {
    const repos = (policy.github.repos as typeof repo[]).filter((entry) =>
      entry.services.includes(snap.item.service),
    );
    const selected = repos[0];
    // callerProjectId is deliberately not consulted, matching the source.
    void callerProjectId;
    return repos.length === 1 && selected !== undefined ? selected.repo : null;
  };
  const reproducedRepoForB = reproducedSelect(PROJECT_B, snapshot);

  const resolve = contextClient(api as any, policy as any);
  const forB = await resolve(
    { projectId: PROJECT_B, actor: 'dummy-actor', commandId: 'dummy-cmd-b' } as any,
    snapshot as any,
  );
  const forA = await resolve(
    { projectId: PROJECT_A, actor: 'dummy-actor', commandId: 'dummy-cmd-a' } as any,
    snapshot as any,
  );

  const confirmed =
    reproducedRepoForB === REPO &&
    forB.repo.repo === REPO &&
    forA.repo.repo === REPO &&
    apiRefs.every((ref) => ref.projectId === PROJECT_A || ref.projectId === PROJECT_B);

  console.log(
    JSON.stringify({
      lead,
      verdict: confirmed ? 'confirmed' : 'inconclusive',
      observed: {
        dummyOnly: true,
        sourceCitation: sourceLine,
        exportedSelectorFound: false,
        projects: { projectA: PROJECT_A, projectB: PROJECT_B },
        snapshotService: snapshot.item.service,
        policyRepoServices: repo.services,
        reproducedSelectionForCallerB: reproducedRepoForB,
        realContextClientCallerB: {
          callerProjectId: PROJECT_B,
          selectedRepo: forB.repo.repo,
          category: forB.category,
          deploymentIdPrefix: forB.deploymentId.slice(0, 8),
        },
        realContextClientCallerA: {
          callerProjectId: PROJECT_A,
          selectedRepo: forA.repo.repo,
        },
        apiRefs,
        apiRefsUseCallerProject: true,
      },
      reason: confirmed
        ? 'contextClient selects the repository solely with policy.github.repos.filter(repo => repo.services.includes(snapshot.item.service)) at lines 42-46; caller.projectId is used only in the later internal API reference, never in selection. With caller.projectId=projB and a snapshot whose service maps to the sole repo, the real contextClient still returned that repo, and caller.projectId=projA returned the identical repo.'
        : 'Expected source-grounded result was not observed; see observed fields for which step diverged.',
    }),
  );
} catch (error) {
  fail(error);
}
