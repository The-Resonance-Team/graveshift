// Fingerprint: packages/actuator/createDockerRestarter/compose-project-binding
const LEAD = 'packages/actuator/createDockerRestarter/compose-project-binding';

function emit(verdict: string, observed: Record<string, unknown>, reason: string) {
  console.log(JSON.stringify({ lead: LEAD, verdict, observed, reason }));
}

try {
  const { createDockerRestarter } = await import('/target/packages/actuator/src/backends.ts');

  const idA = 'container-aaaadummy';
  const idB = 'container-bbbbdummy';
  const calls: Array<{ kind: string; pathname: string; decodedFilters: string | null; method: string }> = [];

  // Recording fetch: two containers share the compose.service label but belong
  // to two different dummy Compose projects. No real network or Docker socket.
  const fakeFetch = async (url: URL, init?: RequestInit) => {
    const u = new URL(url);
    const raw = u.searchParams.get('filters');
    let decodedFilters: string | null = null;
    try {
      decodedFilters = raw === null ? null : decodeURIComponent(raw);
    } catch {
      decodedFilters = raw;
    }
    if (u.pathname === '/containers/json') {
      calls.push({ kind: 'list', pathname: u.pathname, decodedFilters, method: init?.method ?? 'GET' });
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              Id: idA,
              Labels: {
                'com.docker.compose.service': 'worker',
                'com.docker.compose.project': 'dummy-project-alpha',
              },
            },
            {
              Id: idB,
              Labels: {
                'com.docker.compose.service': 'worker',
                'com.docker.compose.project': 'dummy-project-beta',
              },
            },
          ];
        },
      } as any;
    }
    if (u.pathname.startsWith('/containers/') && u.pathname.endsWith('/restart')) {
      calls.push({ kind: 'restart', pathname: u.pathname, decodedFilters: null, method: init?.method ?? 'GET' });
      return { ok: true, status: 200, async json() { return {}; } } as any;
    }
    return { ok: false, status: 404, async json() { return {}; } } as any;
  };

  const restarter = createDockerRestarter('http://dummy-proxy.invalid:2375', fakeFetch as any);
  await restarter.restart('worker');

  const listCall = calls.find((c) => c.kind === 'list');
  const restartCalls = calls.filter((c) => c.kind === 'restart');
  const restartIds = restartCalls.map((c) => decodeURIComponent(c.pathname.split('/')[2]));

  let listFilter: unknown = null;
  if (listCall?.decodedFilters) {
    try {
      listFilter = JSON.parse(listCall.decodedFilters);
    } catch {
      listFilter = listCall.decodedFilters;
    }
  }

  const filterHasProject = listCall?.decodedFilters?.includes('com.docker.compose.project') ?? false;
  const bothRestarted = restartIds.includes(idA) && restartIds.includes(idB);
  const confirmed = bothRestarted && !filterHasProject;

  emit(
    confirmed ? 'confirmed' : 'inconclusive',
    {
      listDecodedFilters: listCall?.decodedFilters ?? null,
      listFilter,
      listFilterHasProjectPredicate: filterHasProject,
      restartTargets: restartIds,
      bothDifferentProjectContainersRestarted: bothRestarted,
      restartMethods: restartCalls.map((c) => c.method),
    },
    confirmed
      ? 'The list filter contains only the com.docker.compose.service label with no project predicate; both containers (dummy-project-alpha and dummy-project-beta) were POST-restarted.'
      : bothRestarted
        ? 'Both containers were restarted but a project predicate was present in the filter; cannot confirm missing project binding.'
        : 'One or both containers were not restarted; cannot confirm cross-project binding.',
  );
} catch (error) {
  emit('inconclusive', { error: String(error), stack: (error as Error)?.stack }, 'Import or execution failed; cannot establish the result.');
}
