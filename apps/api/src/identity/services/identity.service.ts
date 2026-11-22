import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BOOT_CONFIG, type RootBootConfig } from '../../config/boot.config';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../../auth/auth.types';
import { expandScopes } from '../../auth/scopes';
import {
  ACCOUNT_JWT_AUDIENCE,
  DEFAULT_DAEMON_GRANT,
  IDENTITY_REPO,
  MIGRATED_ORG_ID,
  type AccountPrincipal,
  type AccountProfile,
  type IdentityRepo,
} from '../identity.types';
import type {
  AddMemberDto,
  ChangePasswordDto,
  CreateOAuthClientDto,
  CreateOrganizationDto,
  CreateProjectDto,
  LoginDto,
  OnboardingDto,
  RegisterDto,
} from '../dto/identity.dto';

// The client secret is a one-way SHA-256 hash. Account passwords use Bun.password.
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class IdentityService {
  constructor(
    @Inject(IDENTITY_REPO) private readonly repo: IdentityRepo,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
    @Inject(BOOT_CONFIG) private readonly boot: Pick<RootBootConfig, 'rootAdmin'>,
    private readonly jwt: JwtService,
  ) {}

  /** Runs on first boot only. Later boots ignore the root admin env keys. */
  async bootstrap(): Promise<void> {
    if ((await this.repo.countAccounts()) > 0) return;
    const root = this.boot.rootAdmin;
    if (root === undefined) return;
    const account = await this.repo.addAccount({
      email: root.email.toLowerCase(),
      passwordHash: await Bun.password.hash(root.password, { algorithm: 'argon2id' }),
      mustChangePassword: true,
    });
    const organization = await this.repo.addOrganization({
      name: root.orgName,
      slug: root.orgSlug,
    });
    await this.repo.addMembership({
      accountId: account.id,
      orgId: organization.id,
      role: 'owner',
    });
    await this.ensureGrant();
    await this.repo.adoptMigratedProjects(organization.id);
  }

  async register(dto: RegisterDto): Promise<AccountProfile> {
    const email = dto.email.toLowerCase();
    if ((await this.repo.findAccountByEmail(email)) !== undefined) {
      throw new ConflictException('The account already exists');
    }
    const account = await this.repo.addAccount({
      email,
      passwordHash: await Bun.password.hash(dto.password, { algorithm: 'argon2id' }),
      mustChangePassword: false,
    });
    return this.profile(account.id);
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const account = await this.repo.findAccountByEmail(dto.email.toLowerCase());
    if (account === undefined || !(await Bun.password.verify(dto.password, account.passwordHash))) {
      throw new UnauthorizedException();
    }
    const access_token = await this.jwt.signAsync(
      { sub: account.id, email: account.email },
      {
        secret: this.config.jwtSecret,
        issuer: this.config.jwtIssuer,
        audience: ACCOUNT_JWT_AUDIENCE,
        algorithm: 'HS256',
        expiresIn: 3600,
      },
    );
    return { access_token };
  }

  async profile(accountId: string): Promise<AccountProfile> {
    const account = await this.requireAccount(accountId);
    return {
      id: account.id,
      email: account.email,
      mustChangePassword: account.mustChangePassword,
      organizations: (await this.repo.listMemberships(accountId)).map((membership) => ({
        orgId: membership.orgId,
        role: membership.role,
      })),
    };
  }

  /** A registered account with no Organization may only call this route. */
  async onboarding(accountId: string, dto: OnboardingDto): Promise<AccountProfile> {
    if ((await this.repo.listMemberships(accountId)).length > 0) {
      throw new ConflictException('The account already belongs to an Organization');
    }
    const organization = await this.repo.addOrganization(dto);
    await this.repo.addMembership({ accountId, orgId: organization.id, role: 'owner' });
    await this.ensureGrant();
    // Projects rewritten by the identity migration become owned by the first org.
    await this.repo.adoptMigratedProjects(organization.id);
    return this.profile(accountId);
  }

  async createOrganization(accountId: string, dto: CreateOrganizationDto) {
    await this.requireMembership(accountId);
    const organization = await this.repo.addOrganization(dto);
    await this.repo.addMembership({ accountId, orgId: organization.id, role: 'owner' });
    return organization;
  }

  async createProject(accountId: string, orgId: string, dto: CreateProjectDto) {
    await this.requireMembership(accountId, orgId);
    if ((await this.repo.findProjectBySlug(orgId, dto.slug)) !== undefined) {
      throw new ConflictException('The Project slug is already used in this Organization');
    }
    const projectId = await this.repo.nextProjectId();
    const project = await this.repo.addProject({ ...dto, projectId, orgId });
    await this.repo.grantProject(DEFAULT_DAEMON_GRANT, projectId);
    return project;
  }

  async listProjects(accountId: string, orgId: string) {
    await this.requireMembership(accountId, orgId);
    return this.repo.listProjects(orgId);
  }

  async addMember(accountId: string, orgId: string, dto: AddMemberDto) {
    await this.requireOwner(accountId, orgId);
    const account = await this.repo.findAccountByEmail(dto.email.toLowerCase());
    if (account === undefined) throw new NotFoundException('The registered Account was not found');
    await this.repo.addMembership({ accountId: account.id, orgId, role: 'member' });
    return { accountId: account.id, orgId, role: 'member' as const };
  }

  async createOAuthClient(accountId: string, orgId: string, dto: CreateOAuthClientDto) {
    await this.requireOwner(accountId, orgId);
    const project = await this.repo.findProject(dto.projectId);
    if (project === undefined || project.orgId !== orgId) {
      throw new ForbiddenException('The Project is not in this Organization');
    }
    const clientId = randomUUID();
    const secret = randomBytes(32).toString('hex');
    await this.repo.addOAuthClient({
      clientId,
      secretHash: digest(secret),
      orgId,
      projectId: dto.projectId,
      scopes: expandScopes(dto.scopes),
    });
    // The secret is returned once. Only its hash is stored.
    return { clientId, clientSecret: secret, projectId: dto.projectId };
  }

  async changePassword(accountId: string, dto: ChangePasswordDto): Promise<void> {
    const account = await this.requireAccount(accountId);
    if (!(await Bun.password.verify(dto.currentPassword, account.passwordHash))) {
      throw new UnauthorizedException();
    }
    await this.repo.setPassword(
      account.id,
      await Bun.password.hash(dto.newPassword, { algorithm: 'argon2id' }),
    );
  }

  async principal(accountId: string): Promise<AccountPrincipal> {
    const account = await this.requireAccount(accountId);
    return {
      accountId: account.id,
      email: account.email,
      mustChangePassword: account.mustChangePassword,
      memberships: await this.repo.listMemberships(accountId),
    };
  }

  private async ensureGrant(): Promise<void> {
    if ((await this.repo.findGrant(DEFAULT_DAEMON_GRANT)) === undefined) {
      await this.repo.addGrant({
        id: randomUUID(),
        name: DEFAULT_DAEMON_GRANT,
        projectIds: [],
      });
    }
  }

  private async requireAccount(accountId: string) {
    const account = await this.repo.findAccountById(accountId);
    if (account === undefined) throw new UnauthorizedException();
    return account;
  }

  private async requireMembership(accountId: string, orgId?: string): Promise<void> {
    const memberships = await this.repo.listMemberships(accountId);
    if (memberships.length === 0) throw new ForbiddenException('The account has no Organization');
    if (orgId !== undefined && !memberships.some((item) => item.orgId === orgId)) {
      throw new ForbiddenException('The Organization is not available to this account');
    }
  }

  private async requireOwner(accountId: string, orgId: string): Promise<void> {
    const memberships = await this.repo.listMemberships(accountId);
    if (!memberships.some((item) => item.orgId === orgId && item.role === 'owner')) {
      throw new ForbiddenException('An owner role is required');
    }
  }
}

// Keep the system-org constant reachable from the identity module for database tests.
export { MIGRATED_ORG_ID };
