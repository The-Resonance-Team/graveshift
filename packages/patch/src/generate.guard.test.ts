import { describe, expect, test } from 'bun:test';

import { generatePatch, type GeneratePatchOptions } from './generate';
import { fakeGateway, fixA, ok, options } from './generate.test-helpers';
import { GIT_EMPTY_BLOB_SHA, type PatchProposal } from './schemas';

// Nothing a model returns may weaken the guard or the base check. Every case
// here is a successful gateway reply that the caller must never see.
describe('generatePatch guard', () => {
  test('model output cannot grant a permission', async () => {
    const withGrant = {
      baseSha: 'base-sha',
      files: [
        {
          path: 'src/a.ts',
          baseBlobSha: 'blob-a',
          content: 'x',
          linesChanged: 1,
          permissions: ['deploy'],
        },
      ],
    };
    const result = await generatePatch(options(fakeGateway(ok(withGrant as PatchProposal))));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('permissions');
  });

  test('diff and content together are not a valid file', async () => {
    const both = {
      baseSha: 'base-sha',
      files: [
        {
          path: 'src/a.ts',
          baseBlobSha: 'blob-a',
          diff: '@@ -1 +1 @@\n-const price = null;\n+const price = 1;\n',
          content: 'const price = 1;\n',
          linesChanged: 1,
        },
      ],
    };
    const result = await generatePatch(options(fakeGateway(ok(both as PatchProposal))));
    expect(result.ok).toBe(false);
  });

  test('the guard runs before any caller-visible success', async () => {
    const accepted = await generatePatch(options(fakeGateway(ok(fixA))));
    expect(accepted.ok).toBe(true);

    const bad = {
      baseSha: 'base-sha',
      files: [
        {
          path: 'deploy/a.yaml',
          baseBlobSha: GIT_EMPTY_BLOB_SHA,
          content: 'x',
          linesChanged: 1,
        },
      ],
    };
    const rejected = await generatePatch(options(fakeGateway(ok(bad as PatchProposal))));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.reasons).toContain('deploy/a.yaml: forbidden path');
  });

  test('a caller cannot bypass the guard', async () => {
    const bad = {
      baseSha: 'base-sha',
      files: [
        {
          path: 'deploy/a.yaml',
          baseBlobSha: GIT_EMPTY_BLOB_SHA,
          content: 'x',
          linesChanged: 1,
        },
      ],
    };
    const spoofed = {
      ...options(fakeGateway(ok(bad as PatchProposal))),
      guard: () => undefined,
    } as unknown as GeneratePatchOptions;
    const result = await generatePatch(spoofed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reasons).toContain('deploy/a.yaml: forbidden path');
  });

  test('an under-reported large file is rejected after the model call', async () => {
    const content = Array.from({ length: 201 }, (_unused, index) => `line ${index}`).join('\n');
    const big = {
      baseSha: 'base-sha',
      files: [{ path: 'src/big.ts', baseBlobSha: GIT_EMPTY_BLOB_SHA, content, linesChanged: 1 }],
    };
    const result = await generatePatch(options(fakeGateway(ok(big as PatchProposal))));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasons).toContain('src/big.ts: content exceeds maxLinesChanged 200');
    }
  });
});
