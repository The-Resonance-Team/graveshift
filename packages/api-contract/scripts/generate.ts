// Generation imports apps/api on purpose: the controllers own the OpenAPI document,
// so the script boots the real app. openapi-typescript stays pinned to 6.7.6 because
// v7 needs TypeScript 5 and this repo uses TypeScript 7.
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import openapiTS, { type OpenAPI3 } from 'openapi-typescript';
const check = process.argv.includes('--check');
// Document generation only boots the app; it never signs a token. Set an
// ephemeral value before the imports, because ConfigModule validates at import.
process.env.GRAVESHIFT_OAUTH_JWT_SECRET ??= randomBytes(32).toString('hex');
const { createApp } = await import('../../../apps/api/src/app.factory');
const { createOpenApiDocument } = await import('../../../apps/api/src/openapi');
const app = await createApp();
const document = createOpenApiDocument(app);
await app.close();

// Adapter boundary: Swagger and the generator define their own OpenAPI object types.
// openapi-typescript 6 drops Zod string patterns, so restore the assignee template literal here.
const AGENT_ASSIGNEE_PATTERN = '^(needs_agent_)[\\s\\S]{0,}$';
const types = await openapiTS(document as OpenAPI3, {
  transform(schemaObject) {
    // The pinned generator's SchemaObject type omits type and pattern, so narrow at this boundary.
    const candidate = schemaObject as { type?: unknown; pattern?: unknown };
    if (candidate.type === 'string' && candidate.pattern === AGENT_ASSIGNEE_PATTERN) {
      return '`needs_agent_${string}`';
    }
    return undefined;
  },
});

const outputs: Array<[URL, string]> = [
  [new URL('../src/openapi.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`],
  [new URL('../src/generated/api.ts', import.meta.url), `${types.trimEnd()}\n`],
];

if (check) {
  const matches = await Promise.all(
    outputs.map(async ([path, content]) => (await Bun.file(path).text()) === content),
  );
  outputs.forEach(([path], index) => {
    if (!matches[index]) {
      console.error(`Generated file is stale: ${path.pathname}`);
      process.exitCode = 1;
    }
  });
} else {
  await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
  await Promise.all(outputs.map(([path, content]) => Bun.write(path, content)));
}
