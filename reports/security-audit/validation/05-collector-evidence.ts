// Bounded validation of project-less Collector evidence reads in createReadRuntime.
// One dummy CollectorReads source is "reserved" for Project A; no Project is passed to logs().
const lead = 'apps/daemon/src/reads.ts:collector-evidence-without-project';

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
  const { createReadRuntime } = await import('/target/apps/daemon/src/reads.ts');

  const PROJECT_A = 'projA';
  const PROJECT_B = 'projB';
  const RESERVED_SERVICE = 'reserved-service';
  const SENTINEL = 'SENTINEL_PROJECT_A_EVIDENCE_OK';

  const tailCalls: Array<{ service: string; lines: number }> = [];
  const listCalls: string[] = [];
  const reservedSource = {
    async listServices() {
      listCalls.push('listServices');
      return [{ name: RESERVED_SERVICE, runtime: 'docker' as const }];
    },
    async tailLogs(service: string, lines: number) {
      tailCalls.push({ service, lines });
      return [SENTINEL];
    },
    async getHealth(service: string) {
      return { service, status: 'healthy' as const, checkedAt: '2026-01-01T00:00:00.000Z' };
    },
  };

  const apiCalls: Array<{ path: string; body: unknown }> = [];
  const api = {
    async get(path: string, _schema: unknown) {
      apiCalls.push({ path, body: null });
      return null;
    },
    async post(path: string, body: unknown, _schema: unknown) {
      apiCalls.push({ path, body });
      if (path === '/internal/hauntings/list') return [];
      return null;
    },
  };

  const reads = createReadRuntime({
    api: api as any,
    sources: [reservedSource as any],
    metricJobs: [],
  });

  // Production callback shape: logs(service, lines) with no Project argument.
  const logLines = await reads.logs(RESERVED_SERVICE, 1);
  const sentinelReturned = logLines.length === 1 && logLines[0] === SENTINEL;

  // A project-scoped read for a different Project still sees the reserved inventory.
  const bServices = await reads.services(PROJECT_B);
  const reservedInventoryVisibleToB = bServices.some((view) => view.name === RESERVED_SERVICE);
  const aServices = await reads.services(PROJECT_A);
  const reservedInventoryVisibleToA = aServices.some((view) => view.name === RESERVED_SERVICE);

  const confirmed = sentinelReturned && reservedInventoryVisibleToB && reservedInventoryVisibleToA;

  console.log(
    JSON.stringify({
      lead,
      verdict: confirmed ? 'confirmed' : 'inconclusive',
      observed: {
        dummyOnly: true,
        projectA: PROJECT_A,
        projectB: PROJECT_B,
        reservedService: RESERVED_SERVICE,
        sentinel: SENTINEL,
        logsCall: { service: RESERVED_SERVICE, lines: 1, projectArgument: 'none' },
        logLines,
        sentinelReturned,
        tailCalls,
        listCalls,
        servicesForProjectB: bServices,
        servicesForProjectA: aServices,
        reservedInventoryVisibleToB,
        reservedInventoryVisibleToA,
        apiCalls,
      },
      reason: confirmed
        ? 'createReadRuntime exposes logs(service, lines) with no Project parameter; the Collector inventory is host-wide. A source reserved for Project A was reached by a project-less logs() call (sentinel returned), and the same reserved inventory appeared in services(projectB) as well as services(projectA). Project A evidence is reachable without a Project binding.'
        : 'Expected source-grounded result was not observed; see observed fields for which step diverged.',
    }),
  );
} catch (error) {
  fail(error);
}
