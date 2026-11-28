export const SAMPLE_NOTICE =
  'Static sample data for console design review. No network, credentials, or real system effects.';

export const PLANNED_DEMO_NOTICE =
  'Planned UI concept for design review only. This is not an API payload or an implemented capability.';

export const SAMPLE_IDS = {
  ownerAccount: '11111111-1111-4111-8111-111111111111',
  memberAccount: '22222222-2222-4222-8222-222222222222',
  newAccount: '33333333-3333-4333-8333-333333333333',
  passwordAccount: '44444444-4444-4444-8444-444444444444',
  organization: '55555555-5555-4555-8555-555555555555',
  checkoutProject: '314159265',
  sandboxProject: '271828182',
  sampleClient: '66666666-6666-4666-8666-666666666666',
} as const;

export const SAMPLE_TIMESTAMPS = {
  date: '2026-11-27',
  earlier: '2026-11-20T08:00:00.000Z',
  anchor: '2026-11-27T08:00:00.000Z',
  later: '2026-11-27T09:30:00.000Z',
  expiry: '2026-12-27T08:00:00.000Z',
} as const;

export type FixtureOrigin = 'api_shaped' | 'view_model' | 'planned_demo';

export type FixtureScope =
  | { kind: 'account'; accountId: string }
  | { kind: 'organization'; accountId: string; orgId: string }
  | { kind: 'project'; accountId: string; orgId: string; projectId: string };

export interface SampleFixture<T> {
  readonly id: string;
  readonly sample: true;
  readonly origin: FixtureOrigin;
  readonly scope: FixtureScope;
  readonly notice: string;
  readonly payload: T;
}

export const newAccountScope = {
  kind: 'account',
  accountId: SAMPLE_IDS.newAccount,
} as const;

export const ownerAccountScope = {
  kind: 'account',
  accountId: SAMPLE_IDS.ownerAccount,
} as const;

export const memberAccountScope = {
  kind: 'account',
  accountId: SAMPLE_IDS.memberAccount,
} as const;

export const passwordAccountScope = {
  kind: 'account',
  accountId: SAMPLE_IDS.passwordAccount,
} as const;

export const organizationScope = {
  kind: 'organization',
  accountId: SAMPLE_IDS.ownerAccount,
  orgId: SAMPLE_IDS.organization,
} as const;

export const projectScope = {
  kind: 'project',
  accountId: SAMPLE_IDS.ownerAccount,
  orgId: SAMPLE_IDS.organization,
  projectId: SAMPLE_IDS.checkoutProject,
} as const;

export const sandboxProjectScope = {
  kind: 'project',
  accountId: SAMPLE_IDS.ownerAccount,
  orgId: SAMPLE_IDS.organization,
  projectId: SAMPLE_IDS.sandboxProject,
} as const;

export function sampleFixture<T>(
  id: string,
  origin: FixtureOrigin,
  scope: FixtureScope,
  payload: T,
): SampleFixture<T> {
  return {
    id,
    sample: true,
    origin,
    scope,
    notice: origin === 'planned_demo' ? PLANNED_DEMO_NOTICE : SAMPLE_NOTICE,
    payload,
  };
}
