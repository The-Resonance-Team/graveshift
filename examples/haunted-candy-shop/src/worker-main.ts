import { createWorker } from './worker';

const worker = createWorker(process.env);
setInterval(() => worker.tick(), 1000);
Bun.serve({ port: Number(process.env.PORT ?? 3001), fetch: (req) => worker.fetch(req) });
