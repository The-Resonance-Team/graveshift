// Bounded validation of service-cache keying across Projects in createObservations.
// All principals, records and adapters are dummy; gateway is rules-only (no model call).
const lead = 'apps/daemon/src/observations.ts:service-cache-project-scope';

type AnyRecord = Record<string, any>;

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
  const { createObservations } = await import('/target/apps/daemon/src/observations.ts');
  const { HttpFailure } = await import('/target/apps/daemon/src/private-http.ts');
  const watcherIndex = await import('/target/packages/watcher/src/index.ts');
  const watcherRules = await import('/target/packages/watcher/src/rules.ts');

  const PROJECT_A = 'projA';
  const PROJECT_B = 'projB';
  const SERVICE = 'checkout';
  const INCIDENT_A = 'incident-a-checkout';
  const T1 = '2026-01-01T00:00:00.000Z';
  const T2 = '2026-01-01T00:05:00.000Z';
  const T3 = '2026-01-01T00:11:00.000Z'; // > 10 min dedupe window after T1

  const diagnosis: AnyRecord = {
    id: 'diag-dummy-a',
    incidentId: INCIDENT_A,
    rootCause: 'dummy seeded root cause',
    evidence: [{ ref: 'sig-dummy-seed', excerpt: 'dummy evidence excerpt' }],
    confidence: 0.6,
    createdAt: T1,
  };
  const detection = (id: string, eventId: string, observedAt: string): AnyRecord => ({
    id,
    projectId: PROJECT_A,
    eventId,
    traceId: `trace-${eventId}`,
    rule: 'runtime.oom',
    service: SERVICE,
    severity: 'critical',
    fingerprint: `${SERVICE}:runtime.oom`,
    message: 'dummy OOM signal',
    observedAt,
  });
  const seedDetection = detection('evt-seed:runtime.oom', 'evt-seed', T1);

  // Fake PrivateApi: haunting records keyed by (projectId, id); active() hides resolved/dismissed.
  const records = new Map<string, AnyRecord>();
  const key = (projectId: string, id: string) => `${projectId}\u0000${id}`;
  const writes: AnyRecord[] = [];
  const apiCalls: AnyRecord[] = [];
  const workCalls: AnyRecord[] = [];
  const activeLookup = (projectId: string, service: string): AnyRecord | null => {
    for (const [k, view] of records) {
      const [owner] = k.split('\u0000');
      if (
        owner === projectId &&
        view.incident.service === service &&
        !['resolved', 'dismissed'].includes(view.incident.state)
      ) {
        return structuredClone(view);
      }
    }
    return null;
  };
  const api = {
    async get(path: string, _schema: unknown): Promise<unknown> {
      apiCalls.push({ path });
      throw new HttpFailure(404, `dummy get not found: ${path}`);
    },
    async post(path: string, body: AnyRecord, _schema: unknown): Promise<any> {
      apiCalls.push({
        path,
        projectId: body?.projectId ?? null,
        id: body?.id ?? null,
        service: body?.service ?? null,
      });
      if (path === '/internal/hauntings/active') {
        return activeLookup(body.projectId, body.service);
      }
      if (path === '/internal/hauntings/get') {
        const found = records.get(key(body.projectId, body.id));
        if (found === undefined) throw new HttpFailure(404, 'dummy haunting not found');
        return structuredClone(found);
      }
      if (path === '/internal/hauntings') {
        const view = body.view as AnyRecord;
        records.set(key(body.projectId, view.incident.id), structuredClone(view));
        writes.push({
          projectId: body.projectId,
          eventId: body.eventId,
          incidentId: view.incident.id,
          state: view.incident.state,
          detectionIds: (view.detections ?? []).map((d: AnyRecord) => d.id),
        });
        return structuredClone(view);
      }
      if (path === '/internal/work-items/from-haunting') {
        workCalls.push({ projectId: body.projectId, incidentId: body.incidentId });
        return {
          item: { id: 'work-dummy', diagnosisRef: diagnosis.id, service: SERVICE },
          created: true,
        };
      }
      throw new HttpFailure(404, `dummy api has no route ${path}`);
    },
  };

  records.set(
    key(PROJECT_A, INCIDENT_A),
    structuredClone({
      incident: {
        id: INCIDENT_A,
        service: SERVICE,
        state: 'open',
        signalIds: [seedDetection.id],
        diagnosis,
        openedAt: T1,
        updatedAt: T1,
      },
      severity: 'critical',
      category: 'resource_exhaustion',
      detections: [seedDetection],
      deploymentId: null,
    } satisfies AnyRecord),
  );

  let gatewayCalls = 0;
  const gateway = {
    async run(request: AnyRecord): Promise<AnyRecord> {
      gatewayCalls += 1;
      // Rules-only fallback: deterministic local value, never a provider or paid call.
      return {
        callId: 'dummy-call',
        usage: { in: 0, out: 0 },
        costUsd: 0,
        status: 'rules_only',
        value: request.rulesOnly(),
        reason: 'budget',
      };
    },
  };

  const observe = await createObservations({
    api: api as any,
    gateway: gateway as any,
    agents: [{ name: 'dummy-diagnosis', role: 'diagnosis' }] as any,
    logs: async () => ['dummy log line'],
    onWork: async () => {},
  });

  const event = (
    id: string,
    projectId: string,
    type: string,
    observedAt: string,
    severity: 'warning' | 'critical',
  ): AnyRecord => ({
    id,
    projectId,
    source: 'dummy-collector',
    service: SERVICE,
    type,
    severity,
    observedAt,
    traceId: `trace-${id}`,
    fingerprint: `${SERVICE}:${type}`,
    payload: { message: `dummy ${type} signal` },
  });

  // 1) Seed project A's open Haunting for checkout.
  await observe(event('evt-a1', PROJECT_A, 'runtime.oom', T1, 'critical'));
  const seededAfterIntake = activeLookup(PROJECT_A, SERVICE);

  // 2) Project B warning for the same service; B has no active Haunting.
  await observe(event('evt-b1', PROJECT_B, 'http.request', T2, 'warning'));
  const activeForB = activeLookup(PROJECT_B, SERVICE);
  const bRecordKeys = [...records.keys()].filter((k) => k.startsWith(`${PROJECT_B}\u0000`));
  // The B event calls active() and then clears the service-keyed cache entry for checkout.
  const bActiveCall = apiCalls.filter(
    (call) => call.path === '/internal/hauntings/active' && call.projectId === PROJECT_B,
  );

  // 3) External resolution of A's row.
  const row = records.get(key(PROJECT_A, INCIDENT_A))!;
  row.incident.state = 'resolved';
  row.incident.resolvedAt = T2;
  const activeForAWhileResolved = activeLookup(PROJECT_A, SERVICE);

  // 4) Fresh A runtime.oom after the dedupe window.
  await observe(event('evt-a2', PROJECT_A, 'runtime.oom', T3, 'critical'));
  const finalRecord = records.get(key(PROJECT_A, INCIDENT_A))!;
  const activeForAAfter = activeLookup(PROJECT_A, SERVICE);
  const finalDetectionIds: string[] = finalRecord.detections.map((d: AnyRecord) => d.id);
  const appendedToClosedRow = finalDetectionIds.includes('evt-a2:runtime.oom');
  const sameIncidentId = finalRecord.incident.id === INCIDENT_A;
  const stillClosed = finalRecord.incident.state === 'resolved';
  const newActiveHaunting = activeForAAfter !== null;

  const confirmed =
    seededAfterIntake !== null &&
    activeForB === null &&
    bRecordKeys.length === 0 &&
    activeForAWhileResolved === null &&
    appendedToClosedRow &&
    sameIncidentId &&
    stillClosed &&
    !newActiveHaunting;

  console.log(
    JSON.stringify({
      lead,
      verdict: confirmed ? 'confirmed' : 'inconclusive',
      observed: {
        dummyOnly: true,
        watcherApiLoaded:
          typeof watcherIndex.createWatcher === 'function' &&
          typeof watcherRules.createRules === 'function',
        projectA: PROJECT_A,
        projectB: PROJECT_B,
        service: SERVICE,
        seedIncidentId: INCIDENT_A,
        seedActiveFound: seededAfterIntake !== null,
        projectBEvent: {
          type: 'http.request',
          severity: 'warning',
          observedAt: T2,
          activeReturned: activeForB,
          activeLookupForB: bActiveCall,
          hauntingRecordsOwnedByB: bRecordKeys,
        },
        resolution: { incidentId: INCIDENT_A, state: 'resolved', activeReturned: activeForAWhileResolved },
        freshAEvent: {
          type: 'runtime.oom',
          observedAt: T3,
          msAfterSeed: Date.parse(T3) - Date.parse(T1),
          activeReturnedBefore: activeForAWhileResolved,
        },
        writes,
        finalRecords: [...records.entries()].map(([k, v]) => ({
          scopeKey: k,
          incidentId: v.incident.id,
          state: v.incident.state,
          detectionIds: v.detections.map((d: AnyRecord) => d.id),
        })),
        workCallbacks: workCalls,
        gatewayModelCalls: gatewayCalls,
        activeForAAfter,
        appendedToClosedRow,
        sameIncidentId,
        stillClosed,
        newActiveHaunting,
      },
      reason: confirmed
        ? 'createObservations keys byService solely by service name. The project B warning for checkout cleared that shared entry and its release was scoped to B, so when A was resolved and a fresh A runtime.oom arrived after the dedupe window, no A-scoped release occurred: the stale watcher grouper entry reused A incident id, and write() merged the new detection into the resolved row (state stays resolved), leaving no new active Haunting.'
        : 'Expected source-grounded sequence was not observed; see observed fields for which step diverged.',
    }),
  );
} catch (error) {
  fail(error);
}
