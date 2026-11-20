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

export const RepoRulesSchema = z
  .object({
    maxFilesChanged: z.number().int().min(1),
    maxLinesChanged: z.number().int().min(1),
    allowedPaths: z.array(z.string()),
    forbiddenPaths: z.array(z.string()),
  })
  .strict();
export type RepoRules = z.infer<typeof RepoRulesSchema>;
