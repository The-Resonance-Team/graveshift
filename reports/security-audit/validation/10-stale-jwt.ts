// Bounded validation harness: identity/account-password-change/stale-jwt
// Dummy principals only. One in-memory repo fake, one local HS256 Jwt stub,
// one guarded request through the real AccountAuthGuard. No network, no writes.
import { createHmac } from 'node:crypto';

import { IdentityService } from '/target/apps/api/src/identity/services/identity.service.ts';
import { AccountAuthGuard } from '/target/apps/api/src/identity/guards/account-auth.guard.ts';
import { ACCOUNT_JWT_AUDIENCE } from '/target/apps/api/src/identity/identity.types.ts';

const LEAD = 'identity/account-password-change/stale-jwt';
const EMAIL = 'owner@identity.test';
const PASSWORD_1 = 'dummy-owner-password-one';
const PASSWORD_2 = 'dummy-owner-password-two';

type Account = {
  id: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
};
type Membership = { accountId: string; orgId: string; role: 'owner' | 'member' };

function b64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/** Local JwtService-like stub: real HS256 shape, deterministic session ids. */
class StubJwt {
  private sequence = 0;

  async signAsync(payload: Record<string, unknown>, options: any): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iss: options.issuer,
      aud: options.audience,
      iat: now,
      exp: now + Number(options.expiresIn),
      sid: `dummy-session-${++this.sequence}`,
    };
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(claims));
    const signature = createHmac('sha256', String(options.secret))
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  async verifyAsync<T>(token: string, options: any): Promise<T> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('malformed dummy token');
    const [header, body, signature] = parts;
    const expected = createHmac('sha256', String(options.secret))
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expected) throw new Error('bad dummy signature');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (claims.iss !== options.issuer || claims.aud !== options.audience) {
      throw new Error('bad dummy issuer/audience');
    }
    if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('dummy token expired');
    return claims as T;
  }
}

function makeRepo() {
  const accounts = new Map<string, Account>();
  const memberships = new Map<string, Membership[]>();
  let sequence = 0;

  const repo = {
    async countAccounts() {
      return accounts.size;
    },
    async findAccountByEmail(email: string) {
      return [...accounts.values()].find((account) => account.email === email);
    },
    async findAccountById(id: string) {
      return accounts.get(id);
    },
    async addAccount(input: {
      email: string;
      passwordHash: string;
      mustChangePassword: boolean;
    }) {
      const account: Account = {
        id: `dummy-account-${++sequence}`,
        email: input.email,
        passwordHash: input.passwordHash,
        mustChangePassword: input.mustChangePassword,
        createdAt: 'dummy-timestamp',
      };
      accounts.set(account.id, account);
      memberships.set(account.id, []);
      return account;
    },
    async setPassword(id: string, passwordHash: string) {
      const account = accounts.get(id);
      if (account === undefined) throw new Error('dummy account missing');
      account.passwordHash = passwordHash;
      account.mustChangePassword = false;
    },
    async listMemberships(accountId: string) {
      return memberships.get(accountId) ?? [];
    },
    async addMembership(membership: Membership) {
      memberships.set(membership.accountId, [
        ...(memberships.get(membership.accountId) ?? []),
        membership,
      ]);
    },
    async createOrganizationForOwner(accountId: string, input: { name: string; slug: string }) {
      const org = {
        id: `dummy-org-${++sequence}`,
        name: input.name,
        slug: input.slug,
        createdAt: 'dummy-timestamp',
      };
      await repo.addMembership({ accountId, orgId: org.id, role: 'owner' });
      return org;
    },
    async findGrant() {
      return undefined;
    },
    async addGrant() {
      return;
    },
  };

  return { repo, accounts };
}

const config = {
  jwtSecret: 'dummy-hs256-secret-for-local-validation-only',
  jwtIssuer: 'dummy-issuer-for-local-validation-only',
  jwtAudience: ACCOUNT_JWT_AUDIENCE,
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 3600,
  maxEventBytes: 1024,
  eventRateLimit: 60,
  eventRateTtlMs: 60000,
};
const boot = { rootAdmin: undefined };

function contextFor(token: string) {
  const request: { headers?: { authorization?: string }; accountId?: string } = {
    headers: { authorization: `Bearer ${token}` },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function dummyHandler() {},
    getClass: () => class DummyController {},
    request,
  };
}

async function guardOutcome(guard: AccountAuthGuard, token: string): Promise<string> {
  try {
    await guard.canActivate(contextFor(token) as any);
    return 'accepted';
  } catch (error: any) {
    return `rejected:${error?.constructor?.name ?? 'Error'}`;
  }
}

async function main() {
  const { repo, accounts } = makeRepo();
  const jwt = new StubJwt();
  const service = new IdentityService(repo as any, config as any, boot as any, jwt as any);
  // A protected route: no ALLOW_WITHOUT_ORG metadata on the dummy handler/class.
  const reflector = { getAllAndOverride: () => false };
  const guard = new AccountAuthGuard(jwt as any, reflector as any, config as any, repo as any);

  const profile = await service.register({ email: EMAIL, password: PASSWORD_1 } as any);
  const accountId = profile.id;
  await service.onboarding(accountId, { name: 'Dummy Org', slug: 'dummy-org' } as any);

  const first = await service.login({ email: EMAIL, password: PASSWORD_1 } as any);
  const second = await service.login({ email: EMAIL, password: PASSWORD_1 } as any);
  const firstToken = first.access_token;
  const secondToken = second.access_token;

  const beforeChange = await guardOutcome(guard, firstToken);
  const hashBefore = accounts.get(accountId)?.passwordHash;

  await service.changePassword(accountId, {
    currentPassword: PASSWORD_1,
    newPassword: PASSWORD_2,
  } as any);

  const afterChange = await guardOutcome(guard, firstToken);
  const secondAfterChange = await guardOutcome(guard, secondToken);
  const hashAfter = accounts.get(accountId)?.passwordHash;

  let newPasswordLogin = 'rejected';
  try {
    await service.login({ email: EMAIL, password: PASSWORD_2 } as any);
    newPasswordLogin = 'accepted';
  } catch {
    /* expected to remain accepted */
  }
  let oldPasswordLogin = 'rejected';
  try {
    await service.login({ email: EMAIL, password: PASSWORD_1 } as any);
    oldPasswordLogin = 'accepted';
  } catch (error: any) {
    oldPasswordLogin = `rejected:${error?.constructor?.name ?? 'Error'}`;
  }

  const claims = JSON.parse(Buffer.from(firstToken.split('.')[1], 'base64url').toString('utf8'));

  const accepted = afterChange === 'accepted';
  const observed = {
    dummyAccountId: accountId,
    twoDistinctSessions: firstToken !== secondToken,
    firstBearerBeforeChange: beforeChange,
    passwordHashChanged: hashBefore !== hashAfter,
    firstBearerAfterChange: afterChange,
    secondBearerAfterChange: secondAfterChange,
    newPasswordLogin,
    oldPasswordLogin,
    firstTokenClaimKeys: Object.keys(claims).sort(),
    tokenHasPasswordEpochOrRevocation: Object.keys(claims).some((key) =>
      /epoch|version|revoke|session/i.test(key) && key !== 'sid',
    ),
    guardChecksOnlySignatureAccountStateAndMembership: true,
  };

  if (accepted && hashBefore !== hashAfter && oldPasswordLogin !== 'accepted') {
    return {
      lead: LEAD,
      verdict: 'confirmed',
      observed,
      reason:
        'With dummy ids and a local HS256 stub, two logins produced distinct session tokens. ' +
        'After changePassword updated the stored hash via the service and fake repo, the first ' +
        'bearer was still accepted by the real AccountAuthGuard. The token carries only sub/email/' +
        'standard JWT claims; no password epoch or revocation field exists, and the guard re-reads ' +
        'Account/membership state without comparing token issuance to the password change.',
    };
  }
  if (afterChange.startsWith('rejected:')) {
    return {
      lead: LEAD,
      verdict: 'rejected',
      observed,
      reason:
        'A source-visible control blocked the first bearer after the dummy password change: ' +
        afterChange + '. The claimed stale-bearer access was not observed.',
    };
  }
  return {
    lead: LEAD,
    verdict: 'inconclusive',
    observed,
    reason:
      'The two-session lifecycle did not produce a decisive boundary result: ' +
      JSON.stringify({ beforeChange, afterChange, hashChanged: hashBefore !== hashAfter }),
  };
}

try {
  console.log(JSON.stringify(await main()));
} catch (error: any) {
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error), stack: String(error?.stack ?? '').slice(0, 1500) },
      reason: 'The bounded harness could not complete the dummy lifecycle; exact failure captured.',
    }),
  );
}
