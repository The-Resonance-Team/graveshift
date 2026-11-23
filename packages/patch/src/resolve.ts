import { applyUnifiedDiff, lineDiff } from './diff';
import { GIT_EMPTY_BLOB_SHA, type Patch, type PatchProposal } from './schemas';

/**
 * One base file as read from the repository. `text` is null when the file is
 * not valid text; a diff over such a file fails closed.
 */
export interface BaseFile {
  readonly path: string;
  readonly blobSha: string;
  readonly text: string | null;
}

export interface PatchSummary {
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
}

export type ResolveResult =
  | { ok: true; patch: Patch; summary: PatchSummary }
  | { ok: false; reasons: string[] };

const hasDiff = (
  file: PatchProposal['files'][number],
): file is {
  path: string;
  baseBlobSha: string;
  linesChanged: number;
  diff: string;
} => 'diff' in file;

/**
 * Verify a proposal against the pinned base and derive full file text.
 * A proposal whose base SHA or base blob SHA no longer matches is rejected,
 * so the fix can never overwrite newer commits. A diff whose context no longer
 * matches is rejected too.
 */
export function resolvePatch(
  proposal: PatchProposal,
  base: { readonly baseSha: string; readonly files: readonly BaseFile[] },
): ResolveResult {
  const reasons: string[] = [];
  if (proposal.baseSha !== base.baseSha) {
    return { ok: false, reasons: [`stale_base: expected ${base.baseSha}`] };
  }
  const byPath = new Map(base.files.map((file) => [file.path, file]));
  const files: Patch['files'] = [];
  let additions = 0;
  let deletions = 0;
  for (const file of proposal.files) {
    const baseFile = byPath.get(file.path);
    const isNew = baseFile === undefined;
    if (isNew && file.baseBlobSha !== GIT_EMPTY_BLOB_SHA) {
      reasons.push(`${file.path}: unknown path needs the empty-blob SHA`);
      continue;
    }
    if (!isNew && baseFile.blobSha !== file.baseBlobSha) {
      reasons.push(
        `${file.path}: base blob ${file.baseBlobSha} does not match ${baseFile.blobSha}`,
      );
      continue;
    }
    if (hasDiff(file)) {
      if (baseFile !== undefined && baseFile.text === null) {
        reasons.push(`${file.path}: diff over a binary file needs full content`);
        continue;
      }
      const applied = applyUnifiedDiff(baseFile?.text ?? '', file.diff);
      if (applied === undefined) {
        reasons.push(`${file.path}: diff does not apply to the base text`);
        continue;
      }
      const counted = lineDiff(baseFile?.text ?? '', applied);
      additions += counted.additions;
      deletions += counted.deletions;
      files.push({ path: file.path, content: applied, linesChanged: file.linesChanged });
    } else {
      if (file.content === null && baseFile === undefined) {
        reasons.push(`${file.path}: cannot delete a file that does not exist`);
        continue;
      }
      if (file.content !== null && baseFile !== undefined && baseFile.text !== null) {
        const counted = lineDiff(baseFile.text, file.content);
        additions += counted.additions;
        deletions += counted.deletions;
      } else if (file.content !== null) {
        const counted = lineDiff('', file.content);
        additions += counted.additions;
        deletions += counted.deletions;
      } else if (baseFile?.text !== null && baseFile !== undefined) {
        const counted = lineDiff(baseFile.text, '');
        deletions += counted.deletions;
      }
      files.push({ path: file.path, content: file.content, linesChanged: file.linesChanged });
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    patch: { files },
    summary: { filesChanged: files.length, additions, deletions },
  };
}
