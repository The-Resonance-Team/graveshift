import type { Env } from './config';
import { createHaunt } from './haunt';
import { createMetrics } from './metrics';

const LEAK_BYTES = 8 * 1024 * 1024;

export function createWorker(env: Env) {
  const metrics = createMetrics();
  // memory-leech: every tick keeps its buffer alive, the cause a fix PR must remove
  const retained: Buffer[] = [];
  const haunt = createHaunt(env, {
    apply: (scenario) => (scenario === 'memory-leech' ? undefined : 'applies to the api process'),
    reset() {
      retained.length = 0;
    },
  });

  return {
    haunt,
    retainedBytes: () => retained.length * LEAK_BYTES,
    tick() {
      metrics.inc('jobs_processed_total');
      if (haunt.current() === 'memory-leech') retained.push(Buffer.alloc(LEAK_BYTES, 1));
    },
    async fetch(req: Request): Promise<Response> {
      const started = performance.now();
      const res =
        (await haunt.handle(req)) ??
        (new URL(req.url).pathname === '/metrics'
          ? new Response(metrics.render())
          : new URL(req.url).pathname === '/healthz'
            ? Response.json({ status: 'ok' })
            : Response.json({ error: 'not found' }, { status: 404 }));
      metrics.observe(res.status, (performance.now() - started) / 1000);
      return res;
    },
  };
}
