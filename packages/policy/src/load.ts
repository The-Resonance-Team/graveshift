import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

import { type Policy, PolicySchema } from './schema';

export class PolicyError extends GraveshiftError<'POLICY_INVALID'> {
  readonly issues: string[];

  constructor(issues: string[]) {
    super('POLICY_INVALID', `invalid policy:\n${issues.join('\n')}`);
    this.issues = issues;
  }
}

export function parsePolicy(raw: unknown): Policy {
  const parsed = PolicySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new PolicyError(
    parsed.error.issues.map(
      (issue) => `${z.core.toDotPath(issue.path) || '<root>'}: ${issue.message}`,
    ),
  );
}

export async function loadPolicy(path: string): Promise<Policy> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new PolicyError([`<file>: ${path} not found`]);
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(await file.text());
  } catch (error) {
    throw new PolicyError([`<yaml>: ${error instanceof Error ? error.message : 'parse error'}`]);
  }
  return parsePolicy(raw);
}
