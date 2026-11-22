import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../../auth/auth.types';
import {
  ACCOUNT_JWT_AUDIENCE,
  ALLOW_WITHOUT_ORG,
  IDENTITY_REPO,
  type IdentityRepo,
} from '../identity.types';

/** Marks a route a new account or a first-login account may call. */
export const AllowWithoutOrg = () => SetMetadata(ALLOW_WITHOUT_ORG, true);

export interface AccountRequest {
  headers?: { authorization?: string };
  accountId?: string;
}

@Injectable()
export class AccountAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
    @Inject(IDENTITY_REPO) private readonly repo: IdentityRepo,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccountRequest>();
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token === '') throw new UnauthorizedException();
    let accountId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        secret: this.config.jwtSecret,
        issuer: this.config.jwtIssuer,
        audience: ACCOUNT_JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.sub === undefined) throw new UnauthorizedException();
      accountId = payload.sub;
    } catch {
      throw new UnauthorizedException();
    }
    const account = await this.repo.findAccountById(accountId);
    if (account === undefined) throw new UnauthorizedException();
    const allowed =
      this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_ORG, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    if (account.mustChangePassword && !allowed) {
      throw new ForbiddenException('Change the password at first login');
    }
    if ((await this.repo.listMemberships(accountId)).length === 0 && !allowed) {
      throw new ForbiddenException('The account has no Organization');
    }
    request.accountId = accountId;
    return true;
  }
}
