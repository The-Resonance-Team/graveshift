import { type Env, isScenario, type Scenario } from './config';

const sha = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest();

function tokenMatches(expected: string | undefined, req: Request): boolean {
  if (!expected) return false; // fail closed when the token is not configured
  const given =
    req.headers.get('x-haunt-token') ??
    req.headers.get('authorization')?.replace(/^Bearer /, '') ??
    '';
  return Buffer.compare(sha(given), sha(expected)) === 0;
}

export interface HauntHooks {
  apply(scenario: Scenario): Promise<string | undefined> | string | undefined;
  reset(): Promise<void> | void;
}

export function createHaunt(env: Env, hooks: HauntHooks) {
  let scenario: Scenario | null = null;
  return {
    current: () => scenario,
    async handle(req: Request): Promise<Response | null> {
      const { pathname } = new URL(req.url);
      if (req.method !== 'POST' || (pathname !== '/__haunt' && pathname !== '/__reset'))
        return null;

      if (pathname === '/__reset') {
        if (!tokenMatches(env.OWNER_TOKEN, req))
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        scenario = null;
        await hooks.reset();
        return Response.json({ scenario: null });
      }

      if (!tokenMatches(env.HAUNT_TOKEN, req))
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      const body: unknown = await req.json().catch(() => null);
      const requested =
        typeof body === 'object' && body !== null
          ? (body as { scenario?: unknown }).scenario
          : undefined;
      if (!isScenario(requested))
        return Response.json({ error: 'unknown scenario' }, { status: 400 });
      scenario = requested;
      const note = await hooks.apply(requested);
      return Response.json({ scenario, ...(note ? { note } : {}) });
    },
  };
}
