import { z } from 'zod';

// Strict schemas stop model output from carrying extra fields such as a permission grant.
export const PatchFileSchema = z
  .object({
    path: z.string(),
    content: z.string().nullable(),
    linesChanged: z.number(),
  })
  .strict();
export type PatchFile = z.infer<typeof PatchFileSchema>;

export const PatchSchema = z
  .object({
    files: z.array(PatchFileSchema),
  })
  .strict();
export type Patch = z.infer<typeof PatchSchema>;

// The model contract pins every change to a base commit and to the base blob
// of each file it changes. A change either carries a unified diff (preferred)
// or the full file text, never both. New files name the git empty-blob SHA.
export const GIT_EMPTY_BLOB_SHA = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';

const proposalFileBase = {
  path: z.string().min(1),
  baseBlobSha: z.string().min(1),
  linesChanged: z.number().int().min(0),
};

const PatchDiffFileSchema = z.object({ ...proposalFileBase, diff: z.string().min(1) }).strict();

const PatchContentFileSchema = z
  .object({ ...proposalFileBase, content: z.string().nullable() })
  .strict();

export const PatchProposalSchema = z
  .object({
    baseSha: z.string().min(1),
    files: z.array(z.union([PatchDiffFileSchema, PatchContentFileSchema])),
  })
  .strict();
export type PatchProposal = z.infer<typeof PatchProposalSchema>;

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
