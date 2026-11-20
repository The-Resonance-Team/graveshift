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
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'fix';
  return `refs/heads/${prefix}inc-${shortId}-${slug}`;
}

export function assertBranchPrefix(ref: string, prefix: string): void {
  if (!ref.startsWith(`refs/heads/${prefix}`) || prefix === '') {
    throw new BranchError(`branch ${ref} is outside the ${prefix} prefix`);
  }
}
