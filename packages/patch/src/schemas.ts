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
