import { mkdir } from 'node:fs/promises';
import openapiTS, { type OpenAPI3 } from 'openapi-typescript';
import { createApp } from '../../../apps/api/src/app.factory.js';
import { createOpenApiDocument } from '../../../apps/api/src/openapi.js';

const check = process.argv.includes('--check');
const app = await createApp();
const document = createOpenApiDocument(app);
await app.close();

// Adapter boundary: Swagger and the generator define their own OpenAPI object types.
const types = await openapiTS(document as OpenAPI3);

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
