export type TestDbConfig = {
  url: string | undefined;
  runId: string | undefined;
  optIn: string | undefined;
  ci?: string | undefined;
};

export function assertTestDatabase(config: TestDbConfig): string {
  if (config.ci || config.optIn !== '1' || !config.runId || !/^[0-9a-f]{32}$/.test(config.runId)) {
    throw new Error('Local database tests require an explicit isolated-run opt-in outside CI.');
  }
  if (!config.url) throw new Error('The isolated test database URL is missing.');
  const url = new URL(config.url);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    Number(url.port) < 1024 ||
    !url.port ||
    url.username !== 'gs_test' ||
    !url.password ||
    url.pathname !== `/graveshift_test_${config.runId}` ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Refusing a foreign or nonlocal database.');
  }
  return url.toString();
}
