import { type Env, resolveDatabaseUrl } from './config';
import { type Db, memoryDb, pgDb } from './db';
import { createHaunt } from './haunt';
import { createMetrics } from './metrics';

export interface ApiOptions {
  env: Env;
  makeDb?: (url: string) => Db;
}

const log = (level: string, message: string) =>
  process.stderr.write(`${JSON.stringify({ level, message, time: new Date().toISOString() })}\n`);

export function createApi({ env, makeDb = (url) => (url ? pgDb(url) : memoryDb()) }: ApiOptions) {
  const slowMs = Number(env.SLOW_CURSE_MS ?? 1800);
  let db = makeDb(resolveDatabaseUrl(env, null));
  const metrics = createMetrics();

  const haunt = createHaunt(env, {
    async apply(scenario) {
      if (scenario === 'null-candy') await db.nullifyPrice(1);
      if (scenario === 'slow-curse') await db.setIndexed(false);
      if (scenario === 'wrong-potion') db = makeDb(resolveDatabaseUrl(env, scenario));
      if (scenario === 'memory-leech') return 'applies to the worker process';
      if (scenario === 'image-ghost') return 'deploy-level fault, set a bad image tag';
      return undefined;
    },
    async reset() {
      db = makeDb(resolveDatabaseUrl(env, null));
      await db.restore();
    },
  });

  // slow-curse relies on the real search path, null-candy on the unguarded price formatting below
  async function route(req: Request): Promise<Response> {
    const { pathname, searchParams } = new URL(req.url);
    if (pathname === '/healthz') {
      const healthy = await db.ping().catch(() => false);
      return Response.json(
        { status: healthy ? 'ok' : 'unhealthy' },
        { status: healthy ? 200 : 503 },
      );
    }
    if (pathname === '/metrics') return new Response(metrics.render());
    if (pathname === '/candies/search')
      return Response.json(await db.search(searchParams.get('q') ?? ''));
    const match = /^\/candies\/(\d+)$/.exec(pathname);
    if (match) {
      const candy = await db.getCandy(Number(match[1]));
      if (!candy) return Response.json({ error: 'not found' }, { status: 404 });
      return Response.json({ id: candy.id, name: candy.name, price: candy.price!.toFixed(2) });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  return {
    haunt,
    async fetch(req: Request): Promise<Response> {
      const started = performance.now();
      let res: Response;
      try {
        res = (await haunt.handle(req)) ?? (await route(req));
      } catch (error) {
        log('error', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error');
        res = Response.json({ error: 'internal error' }, { status: 500 });
      }
      metrics.observe(res.status, (performance.now() - started) / 1000);
      return res;
    },
    slowMs,
  };
}
