import { z } from 'zod';

export const SHA40_PATTERN = /^[0-9a-f]{40}$/;
// Git blob SHA of empty content: the base identity of a path added by a patch.
export const EMPTY_BLOB_SHA = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
const sha40 = z.string().regex(SHA40_PATTERN);

// Strict schemas stop model output from carrying extra fields such as a permission grant.
export const PatchFileSchema = z
  .object({
    path: z.string(),
    content: z.string().nullable(),
    linesChanged: z.number(),
    // ponytail: full-file patches carry whole content instead of a unified diff; upgrade if the repository line cap rejects a small hunk or review needs per-hunk context
    // 40-hex for a write against a base blob (empty blob for a new file), null for a deletion.
    baseBlobSha: sha40.nullable(),
  })
  .strict();
export type PatchFile = z.infer<typeof PatchFileSchema>;

export const PatchSchema = z
  .object({
    // Whole-tree identity: the commit SHA the patch was generated against.
    baseSha: sha40,
    files: z.array(PatchFileSchema),
  })
  .strict();
export type Patch = z.infer<typeof PatchSchema>;

const pattern = z.string().min(1);

export const RepoRulesSchema = z
  .object({
    maxFilesChanged: z.number().int().min(1),
    maxLinesChanged: z.number().int().min(1),
    // Default [] allows no path: the guard fails closed until a caller sets patterns.
    allowedPaths: z.array(pattern).default([]),
    // Default [] forbids no extra path. allowedPaths still gates every path.
    forbiddenPaths: z.array(pattern).default([]),
  })
  .strict();
export type RepoRules = z.infer<typeof RepoRulesSchema>;
