import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

// Narrow regression guard for the Agent context overlay breakpoint (QA F1, 2026-11-28):
// below the `lg` breakpoint the conversation and the 480px artifact panel cannot both
// remain usable, so the existing full-height overlay must be used instead of the split.
const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

function overlayMaxWidth(): number {
  const query = pageSource.match(/useMediaQuery\('([^']+)'/)?.[1];
  const limit = query?.match(/^\(max-width:\s*(\d+)px\)$/)?.[1];
  if (limit === undefined) {
    throw new Error(`Agent page no longer declares a max-width overlay query: ${query ?? 'none'}`);
  }
  return Number(limit);
}

const maxWidth = overlayMaxWidth();

describe('Agent context overlay breakpoint', () => {
  test.each([375, 768, 900, 1023])('uses the fullscreen overlay at %ipx', (width) => {
    expect(width <= maxWidth).toBe(true);
    expect(pageSource).toContain('isNarrow && isArtifactDialogOpen');
    expect(pageSource).toContain('variant="fullscreen"');
  });

  test.each([1024, 1280, 1440])('keeps the desktop split at %ipx', (width) => {
    expect(width <= maxWidth).toBe(false);
    expect(pageSource).toContain('!isNarrow && isPanelOpen');
  });
});
