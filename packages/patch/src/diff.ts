// Pure unified-diff apply. A hunk applies only when every context and removed
// line matches the base text exactly, so a changed base fails closed.

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

interface HunkLine {
  readonly op: ' ' | '-' | '+';
  readonly text: string;
}

interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: HunkLine[];
  /** Removed lines counted from the hunk itself. */
  readonly deletions: number;
  /** Added lines counted from the hunk itself. */
  readonly additions: number;
}

const isHeader = (line: string): boolean =>
  line.startsWith('--- ') ||
  line.startsWith('+++ ') ||
  line.startsWith('diff ') ||
  line.startsWith('index ') ||
  line.startsWith('similarity index') ||
  line.startsWith('new file mode') ||
  line.startsWith('deleted file mode') ||
  line.startsWith('rename ');

function parseHunks(diff: string): Hunk[] | undefined {
  const raw = diff.replace(/\r\n/g, '\n').split('\n');
  const hunks: Hunk[] = [];
  let cursor = 0;
  while (cursor < raw.length && raw[cursor] !== '' && !HUNK_HEADER.test(raw[cursor] ?? '')) {
    if (!isHeader(raw[cursor] ?? '')) return undefined;
    cursor++;
  }
  if (cursor === raw.length) return undefined;
  while (cursor < raw.length) {
    const header = HUNK_HEADER.exec(raw[cursor] ?? '');
    if (header === null) return undefined; // trailing junk after the last hunk
    const oldStart = Number(header[1]);
    const oldCount = header[2] === undefined ? 1 : Number(header[2]);
    const newStart = Number(header[3]);
    const newCount = header[4] === undefined ? 1 : Number(header[4]);
    cursor++;
    const lines: HunkLine[] = [];
    let deletions = 0;
    let additions = 0;
    let oldSeen = 0;
    let newSeen = 0;
    while (oldSeen < oldCount || newSeen < newCount) {
      const line = raw[cursor];
      if (line === undefined) return undefined;
      cursor++;
      if (line.startsWith('\\')) return undefined; // "\ No newline at end of file" is unsupported
      const op = line[0];
      if (op !== ' ' && op !== '-' && op !== '+') return undefined;
      const text = line.slice(1);
      lines.push({ op, text });
      if (op === ' ') {
        oldSeen++;
        newSeen++;
      } else if (op === '-') {
        oldSeen++;
        deletions++;
      } else {
        newSeen++;
        additions++;
      }
    }
    if (oldSeen !== oldCount || newSeen !== newCount) return undefined;
    hunks.push({ oldStart, oldCount, newStart, newCount, lines, deletions, additions });
    while (cursor < raw.length && raw[cursor] === '') cursor++; // blank separator lines
  }
  return hunks.length > 0 ? hunks : undefined;
}

/** Base text as git lines: a trailing newline is not its own line. */
const toLines = (text: string): string[] =>
  text === '' ? [] : text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');

/**
 * Apply a unified diff to the base text. Returns the new text, or undefined
 * when the diff is malformed or any context line no longer matches. Only files
 * that end with a newline (or are empty) are supported; other files fail closed.
 */
export function applyUnifiedDiff(base: string, diff: string): string | undefined {
  if (base !== '' && !base.endsWith('\n')) return undefined;
  const hunks = parseHunks(diff);
  if (hunks === undefined) return undefined;
  const baseLines = toLines(base);
  const out: string[] = [];
  let pos = 0;
  for (const hunk of hunks) {
    const start = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < pos || start > baseLines.length) return undefined;
    while (pos < start) {
      const line = baseLines[pos];
      if (line === undefined) return undefined;
      out.push(line);
      pos++;
    }
    for (const line of hunk.lines) {
      if (line.op === ' ') {
        if (baseLines[pos] !== line.text) return undefined;
        const kept = baseLines[pos];
        if (kept === undefined) return undefined;
        out.push(kept);
        pos++;
      } else if (line.op === '-') {
        if (baseLines[pos] !== line.text) return undefined;
        pos++;
      } else {
        out.push(line.text);
      }
    }
  }
  while (pos < baseLines.length) {
    const line = baseLines[pos];
    if (line === undefined) return undefined;
    out.push(line);
    pos++;
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

export interface LineDiff {
  readonly additions: number;
  readonly deletions: number;
}

const LCS_LIMIT = 2_000;

/**
 * Real added and removed line counts for full-content changes. Content beyond
 * the LCS limit falls back to the whole changed span, so the number can only
 * over-count, never under-count.
 */
export function lineDiff(before: string, after: string): LineDiff {
  const a = toLines(before);
  const b = toLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const tailA = a.slice(start, endA);
  const tailB = b.slice(start, endB);
  if (tailA.length === 0 || tailB.length === 0) {
    return { additions: tailB.length, deletions: tailA.length };
  }
  if (tailA.length > LCS_LIMIT || tailB.length > LCS_LIMIT) {
    const span = tailA.length + tailB.length;
    return { additions: span, deletions: span };
  }
  const rows = tailA.length + 1;
  const table = new Uint32Array(rows * (tailB.length + 1));
  for (let i = tailA.length - 1; i >= 0; i--) {
    for (let j = tailB.length - 1; j >= 0; j--) {
      const matched = tailA[i] === tailB[j];
      table[i * (tailB.length + 1) + j] = matched
        ? table[(i + 1) * (tailB.length + 1) + j + 1]! + 1
        : Math.max(
            table[(i + 1) * (tailB.length + 1) + j]!,
            table[i * (tailB.length + 1) + j + 1]!,
          );
    }
  }
  const common = table[0]!;
  return { additions: tailB.length - common, deletions: tailA.length - common };
}
