// Bounded validation harness: identity/register-addMember/unverified-email-membership
// Dummy attacker/owner accounts, one in-memory IdentityRepo fake, one local JWT stub.
import { IdentityService } from '/target/apps/api/src/identity/services/identity.service.ts';
import { ACCOUNT_JWT_AUDIENCE } from '/target/apps/api/src/identity/identity.types.ts';

const LEAD = 'identity/register-addMember/unverified-email-membership';
const OWNER_EMAIL = 'dummy-owner@identity.test';
const INTENDED_EMAIL = 'intended-member@identity.test';
const OWNER_PASSWORD = 'dummy-owner-password';
const ATTACKER_PASSWORD = 'dummy-attacker-password';

type Account = {
  id: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
};
type Membership = { accountId: string; orgId: string; role: 'owner' | 'member' };
type Project = {
  projectId: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
};

function makeRepo() {
  const accounts = new Map<string, Account>();
  const memberships = new Map<string, Membership[]>();
  const projects: Project[] = [];
  const grants = new Map<string, { id: string; name: string; projectIds: string[] }>();
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
    async addMemberToOrg(accountId: string, orgId: string, role: 'member') {
      await repo.addMembership({ accountId, orgId, role });
    },
    async findGrant(name: string) {
      return grants.get(name);
    },
    async addGrant(grant: { id: string; name: string; projectIds: string[] }) {
      grants.set(grant.name, grant);
    },
    async findProjectBySlug(orgId: string, slug: string) {
      return projects.find((project) => project.orgId === orgId && project.slug === slug);
    },
    async findProject(projectId: string) {
      return projects.find((project) => project.projectId === projectId);
    },
    async nextProjectId() {
      return `dummy-project-${++sequence}`;
    },
    async createProjectWithGrant(input: {
      projectId: string;
      orgId: string;
      name: string;
      slug: string;
    }) {
      const project: Project = { ...input, createdAt: 'dummy-timestamp' };
      projects.push(project);
      return project;
    },
    async listProjects(orgId: string) {
      return projects.filter((project) => project.orgId === orgId);
    },
    async adoptMigratedProjects() {
      return;
    },
  };

  return { repo, accounts, projects };
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

async function main() {
  const { repo, projects } = makeRepo();
  const service = new IdentityService(repo as any, config as any, boot as any, jwt as any);

  const owner = await service.register({ email: OWNER_EMAIL, password: OWNER_PASSWORD } as any);
  // onboarding returns the AccountProfile, whose organizations carry the real orgId.
  const onboarded = await service.onboarding(owner.id, {
    name: 'Dummy Owner Org',
    slug: 'dummy-owner-org',
  } as any);
  const orgId = onboarded.organizations[0]?.orgId;
  if (orgId === undefined) throw new Error('dummy onboarding produced no owner membership');
  await service.createProject(owner.id, orgId, {
    name: 'Dummy private project',
    slug: 'dummy-private-project',
  } as any);

  // Attacker reserves the intended member's email without controlling the mailbox.
  const attacker = await service.register({
    email: INTENDED_EMAIL,
    password: ATTACKER_PASSWORD,
  } as any);
  await service.login({ email: INTENDED_EMAIL, password: ATTACKER_PASSWORD } as any);

  let beforeGrant = 'allowed';
  try {
    await service.listProjects(attacker.id, orgId);
  } catch (error: any) {
    beforeGrant = `rejected:${error?.constructor?.name ?? 'Error'}`;
  }

  // The legitimate owner adds the intended email; no mailbox proof is requested.
  const added = await service.addMember(owner.id, orgId, { email: INTENDED_EMAIL } as any);
  const attackerProfile = await service.profile(attacker.id);
  const visibleProjects = await service.listProjects(attacker.id, orgId);

  const seesProject = visibleProjects.some((project) =>
    projects.some((stored) => stored.projectId === project.projectId),
  );
  const observed = {
    dummyOwnerId: owner.id,
    dummyOrgId: orgId,
    dummyAttackerId: attacker.id,
    attackerRegisteredIntendedEmail: attacker.email === INTENDED_EMAIL,
    attackerHasNoMailboxProof: true,
    beforeOwnerGrant: beforeGrant,
    ownerAddMemberResult: added,
    attackerProfileOrgs: attackerProfile.organizations,
    attackerListProjects: visibleProjects.map((project) => ({
      projectId: project.projectId,
      orgId: project.orgId,
      slug: project.slug,
    })),
    attackerSeesOwnerOrgProject: seesProject,
  };

  if (seesProject && beforeGrant.startsWith('rejected:')) {
    return {
      lead: LEAD,
      verdict: 'confirmed',
      observed,
      reason:
        'With dummy principals and an in-memory repo, an unauthenticated-style register reserved ' +
        'the intended member email using an attacker password. The owner then added that plain ' +
        'email and IdentityService.addMember resolved it directly to the attacker Account. The ' +
        'attacker, previously denied the Project list, could then list the owner Organization’s ' +
        'dummy Project. No mailbox-verification or invitation-acceptance state exists on this path.',
    };
  }
  if (!seesProject) {
    return {
      lead: LEAD,
      verdict: 'rejected',
      observed,
      reason:
        'A source-visible control prevented the attacker-selected Account from reading the owner ' +
        'dummy Project after addMember; the claimed membership result was not observed.',
    };
  }
  return {
    lead: LEAD,
    verdict: 'inconclusive',
    observed,
    reason:
      'The attacker saw a Project but the negative control did not fail closed as expected; ' +
      JSON.stringify({ beforeGrant }),
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
      reason: 'The bounded dummy membership flow could not complete; exact failure captured.',
    }),
  );
}
