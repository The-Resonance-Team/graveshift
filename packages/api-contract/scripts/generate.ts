// Route and DTO metadata remain the contract source. The document is produced by
// the real Nest app, using the base's generator convention.
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import openapiTS, { type OpenAPI3 } from 'openapi-typescript';

const check = process.argv.includes('--check');
// Document generation only boots the app; it never signs a token. Set an
// ephemeral value before the imports, because ConfigModule validates at import.
process.env.GRAVESHIFT_OAUTH_JWT_SECRET ??= randomBytes(32).toString('hex');
// Document generation boots the app with the daemon config module. No real token is used.
process.env.GRAVESHIFT_DAEMON_READ_TOKEN ??= 'doc-generation-only-read-token';
// The merged boot schema needs these required values. Use ephemeral placeholders only for
// document generation; no database or daemon connection is opened here.
process.env.DATABASE_URL ??= 'postgresql://doc:doc@127.0.0.1:1/doc';
process.env.GRAVESHIFT_PROJECT_ID ??= 'doc-generation';
process.env.GRAVESHIFT_API_INTERNAL_TOKEN ??= randomBytes(32).toString('hex');
process.env.GRAVESHIFT_DAEMON_INTERNAL_TOKEN ??= randomBytes(32).toString('hex');
// The merged boot config reads the agents and policy files. Resolve them against the
// repository root, independent of the caller's working directory.
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

// The pinned generator emits `any[]` in its OneOf helper. Keep the lint baseline at the boundary.
const lintSafeTypes = types.replace('T extends any[]', 'T extends unknown[]');

const outputs: Array<[URL, string]> = [
  [new URL('../src/openapi.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`],
  [new URL('../src/generated/api.ts', import.meta.url), `${lintSafeTypes.trimEnd()}\n`],
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
