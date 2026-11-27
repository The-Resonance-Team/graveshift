// Bounded validation harness: identity/register-login/unthrottled-argon2-work
// Observes real guard metadata on the two controllers and counts dummy password
// work reached through the real IdentityService. No real Argon2, no network.
import { IdentityService } from '/target/apps/api/src/identity/services/identity.service.ts';
import { ACCOUNT_JWT_AUDIENCE } from '/target/apps/api/src/identity/identity.types.ts';

const LEAD = 'identity/register-login/unthrottled-argon2-work';
const EMAIL = 'dummy-user@identity.test';
const GOOD_PASSWORD = 'dummy-valid-password-123';
const BAD_PASSWORD = 'dummy-wrong-password-123';

type Account = {
  id: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
};

function makeRepo() {
  const accounts = new Map<string, Account>();
  const memberships = new Map<string, unknown[]>();
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
      if (account !== undefined) account.passwordHash = passwordHash;
    },
    async listMemberships(accountId: string) {
      return memberships.get(accountId) ?? [];
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
const jwt = { signAsync: async () => 'dummy.local.jwt', verifyAsync: async () => ({}) };

// A child Bun started in the API package directory so NestJS decorators are
// transpiled with that package's experimentalDecorators tsconfig. The child
// only imports controllers and reads Reflect metadata; it executes no route.
const METADATA_PROBE = `
await import("/target/apps/api/node_modules/reflect-metadata/Reflect.js");
const constants = await import("/target/apps/api/node_modules/@nestjs/common/constants.js");
const account = await import("/target/apps/api/src/identity/controllers/account.controller.ts");
const oauth = await import("/target/apps/api/src/auth/controllers/oauth.controller.ts");
const names = (value) => Array.isArray(value)
  ? value.map((entry) => (entry && (entry.name || String(entry))) || String(entry))
  : [];
const out = {
  register: names(Reflect.getMetadata(constants.GUARDS_METADATA, account.AccountController.prototype.register)),
  login: names(Reflect.getMetadata(constants.GUARDS_METADATA, account.AccountController.prototype.login)),
  oauthToken: names(Reflect.getMetadata(constants.GUARDS_METADATA, oauth.OAuthController.prototype.token)),
};
console.log(JSON.stringify(out));
`;

async function readGuardMetadata(): Promise<{
  register: string[];
  login: string[];
  oauthToken: string[];
  childExitCode: number | null;
  error: string | undefined;
}> {
  try {
    const child = Bun.spawn(['bun', '-e', METADATA_PROBE], {
      cwd: '/target/apps/api',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) {
      return {
        register: [],
        login: [],
        oauthToken: [],
        childExitCode: exitCode,
        error: stderr.trim().slice(0, 1200) || 'metadata child exited non-zero',
      };
    }
    const parsed = JSON.parse(stdout.trim());
    return {
      register: Array.isArray(parsed.register) ? parsed.register : [],
      login: Array.isArray(parsed.login) ? parsed.login : [],
      oauthToken: Array.isArray(parsed.oauthToken) ? parsed.oauthToken : [],
      childExitCode: exitCode,
      error: undefined,
    };
  } catch (error: any) {
    return {
      register: [],
      login: [],
      oauthToken: [],
      childExitCode: null,
      error: String(error),
    };
  }
}

async function main() {
  const metadata = await readGuardMetadata();

  const { repo } = makeRepo();
  const service = new IdentityService(repo as any, config as any, boot as any, jwt as any);

  let hashCalls = 0;
  let verifyCalls = 0;
  const originalHash = Bun.password.hash;
  const originalVerify = Bun.password.verify;
  (Bun.password as any).hash = async (_password: string) => `dummy-hash-${++hashCalls}`;
  (Bun.password as any).verify = async (password: string, hash: string) => {
    verifyCalls += 1;
    return password === GOOD_PASSWORD && hash === 'dummy-hash-1';
  };

  let registerOutcome = 'accepted';
  let correctLoginOutcome = 'rejected';
  let wrongLoginOutcome = 'rejected';
  try {
    await service.register({ email: EMAIL, password: GOOD_PASSWORD } as any);
  } catch (error: any) {
    registerOutcome = `rejected:${error?.constructor?.name ?? 'Error'}`;
  }
  try {
    await service.login({ email: EMAIL, password: GOOD_PASSWORD } as any);
    correctLoginOutcome = 'accepted';
  } catch (error: any) {
    correctLoginOutcome = `rejected:${error?.constructor?.name ?? 'Error'}`;
  }
  try {
    await service.login({ email: EMAIL, password: BAD_PASSWORD } as any);
    wrongLoginOutcome = 'accepted';
  } catch (error: any) {
    wrongLoginOutcome = `rejected:${error?.constructor?.name ?? 'Error'}`;
  }

  (Bun.password as any).hash = originalHash;
  (Bun.password as any).verify = originalVerify;

  const reachedRegisterWork = hashCalls >= 1 && registerOutcome === 'accepted';
  const reachedLoginWork = verifyCalls >= 2 && correctLoginOutcome === 'accepted';
  const reachedFailedLoginWork = verifyCalls >= 2 && wrongLoginOutcome.startsWith('rejected:');

  const observed = {
    guardMetadata: {
      accountRegister: metadata.register,
      accountLogin: metadata.login,
      oauthToken: metadata.oauthToken,
      childExitCode: metadata.childExitCode,
      childError: metadata.error,
    },
    passwordWork: {
      hashCalls,
      verifyCalls,
      registerOutcome,
      correctLoginOutcome,
      wrongLoginOutcome,
      reachedRegisterWork,
      reachedLoginWork,
      reachedFailedLoginWork,
      stubScope: 'replaced only Bun.password.hash/verify with counting fakes for this process',
    },
  };

  const noThrottleOnIdentity =
    metadata.register.length === 0 && metadata.login.length === 0;
  const throttledSibling = metadata.oauthToken.includes('ThrottlerGuard');
  const workReached = reachedRegisterWork && reachedLoginWork && reachedFailedLoginWork;

  if (noThrottleOnIdentity && throttledSibling && workReached) {
    return {
      lead: LEAD,
      verdict: 'confirmed',
      observed,
      reason:
        'Runtime metadata shows no guards on AccountController.register/login while ' +
        'OAuthController.token carries ThrottlerGuard. With Bun.password.hash/verify replaced ' +
        'by counting fakes, small dummy register/login requests reached password hashing and ' +
        'verification, including a failed login that still performed verify work. This confirms ' +
        'the localized admission gap and input-to-work path; it does not measure a service outage ' +
        'or decide upstream/runtime work limits.',
    };
  }
  if (!noThrottleOnIdentity) {
    return {
      lead: LEAD,
      verdict: 'rejected',
      observed,
      reason:
        'A source-visible guard is present on register or login in runtime metadata, so the ' +
        'claimed unthrottled admission gap was not observed.',
    };
  }
  return {
    lead: LEAD,
    verdict: 'inconclusive',
    observed,
    reason:
      'One or more required observations are missing: ' +
      JSON.stringify({ noThrottleOnIdentity, throttledSibling, workReached, error: metadata.error }),
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
      reason: 'The bounded metadata/work harness could not complete; exact failure captured.',
    }),
  );
}
