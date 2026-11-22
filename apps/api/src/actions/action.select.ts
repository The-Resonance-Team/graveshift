import type { Prisma } from '@prisma/client';

export const ACTION_CLAIM_SELECT = {
  tokenId: true,
  actionId: true,
  requestHash: true,
  service: true,
  incidentId: true,
  state: true,
  result: true,
} satisfies Prisma.ActionClaimSelect;
