import { createHash } from 'node:crypto';

import { GraveshiftError } from '@graveshift/core';

import { outboundLine } from './outbound';

export class BranchError extends GraveshiftError<'BRANCH_REJECTED'> {
  constructor(message: string) {
    super('BRANCH_REJECTED', message);
  }
}

export function branchRef(incidentId: string, title: string, prefix: string): string {
  const identity = createHash('sha256').update(incidentId).digest('hex').slice(0, 32);
  const parts = outboundLine(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = parts.join('-').slice(0, 40);
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  const ref = `refs/heads/${prefix}inc-${identity}-${slug || 'fix'}`;
  assertBranchPrefix(ref, prefix);
  return ref;
}

export function assertBranchPrefix(ref: string, prefix: string): void {
  if (
    prefix === '' ||
    outboundLine(prefix) !== prefix ||
    !ref.startsWith(`refs/heads/${prefix}`) ||
    /[\p{Cc}\s~^:?*[\]\\]/u.test(ref) ||
    ref.includes('..') ||
    ref.includes('@{') ||
    ref.includes('//') ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))
  ) {
    throw new BranchError(`branch ${ref} is outside the ${prefix} prefix`);
  }
}
