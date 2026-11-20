import { createApi } from './app';

const api = createApi({ env: process.env });
Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: (req) => api.fetch(req) });
