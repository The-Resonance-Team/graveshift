import { GraveshiftError } from '@graveshift/core';

export class BranchError extends GraveshiftError<'BRANCH_REJECTED'> {
  constructor(message: string) {
    super('BRANCH_REJECTED', message);
  }
}

export function branchRef(incidentId: string, title: string, prefix: string): string {
  const shortId =
    incidentId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8) || 'x';
  const parts = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = parts.join('-').slice(0, 40);
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  return `refs/heads/${prefix}inc-${shortId}-${slug || 'fix'}`;
}

export function assertBranchPrefix(ref: string, prefix: string): void {
  if (!ref.startsWith(`refs/heads/${prefix}`) || prefix === '') {
    throw new BranchError(`branch ${ref} is outside the ${prefix} prefix`);
  }
}
