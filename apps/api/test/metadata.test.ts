import { describe, expect, test } from 'bun:test';

import { createMetadataDocument } from '../src/metadata';

describe('Source contract metadata', () => {
  test('generates route metadata without secrets, YAML loading, database or broker setup', async () => {
    const source = new URL('../src/metadata', import.meta.url).pathname;
    const program = `import { createMetadataDocument } from ${JSON.stringify(source)}; const doc = await createMetadataDocument(); console.log(JSON.stringify(Object.keys(doc.paths)));`;
    const child = Bun.spawn(
      [
        process.execPath,
        '--tsconfig-override',
        new URL('../tsconfig.json', import.meta.url).pathname,
        '-e',
        program,
      ],
      {
        cwd: import.meta.dir,
        env: {
          PATH: process.env.PATH ?? '',
          GRAVESHIFT_CONFIG_PATH: '/missing/graveshift.config.yaml',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [code, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code, error).toBe(0);
    expect(output).toContain('/api/work-items/{id}/fix-now');
    expect(output).toContain('/api/config/export');
    expect(output).not.toContain('/internal/');
  });

  test('keeps request field constraints and excludes private runtime operations', async () => {
    const document = await createMetadataDocument();
    const schemas = document.components?.schemas;
    expect(schemas?.FixNowRequestDto).toMatchObject({
      type: 'object',
      properties: { note: { type: 'string', minLength: 1, maxLength: 500 } },
    });
    expect(schemas?.TriageRequestDto).toMatchObject({ required: ['assignee'] });
    expect(Object.keys(document.paths).some((path) => path.startsWith('/internal/'))).toBe(false);
  });
});
