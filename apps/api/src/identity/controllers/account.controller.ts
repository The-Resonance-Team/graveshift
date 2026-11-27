import {
  Body,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { ChangePasswordDto, LoginDto, OnboardingDto, RegisterDto } from '../dto/identity.dto';
import {
  AccountAuthGuard,
  AllowWithoutOrg,
  type AccountRequest,
} from '../guards/account-auth.guard';
import { accountSchema, loginSchema, onboardingSchema } from '../identity.schema';
import { IdentityService } from '../services/identity.service';

/** The guard writes the verified Account id on the request. */
export const RequestAccountId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AccountRequest>();
    if (request.accountId === undefined) throw new UnauthorizedException();
    return request.accountId;
  },
);

@ApiTags('account')
@Controller('api')
export class AccountController {
  constructor(private readonly identity: IdentityService) {}

  @Post('register')
  @ApiOkResponse({
    description: 'A registered Account with no Organization.',
    standardSchema: accountSchema,
  })
  async register(@Body() dto: RegisterDto) {
    return this.identity.register(dto);
  }

  @Post('auth/login')
  @ApiOkResponse({ description: 'An Account session token.', standardSchema: loginSchema })
  @ApiUnauthorizedResponse({ description: 'The email or password is not valid.' })
  async login(@Body() dto: LoginDto) {
    return this.identity.login(dto);
  }

  @Get('account/profile')
  @UseGuards(AccountAuthGuard)
  @AllowWithoutOrg()
  @ApiOkResponse({ description: 'The caller Account profile.', standardSchema: accountSchema })
  async profile(@RequestAccountId() accountId: string) {
    return this.identity.profile(accountId);
  }

  @Post('account/change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountAuthGuard)
  @AllowWithoutOrg()
  async changePassword(
    @RequestAccountId() accountId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.identity.changePassword(accountId, dto);
  }

  @Post('onboarding/org')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountAuthGuard)
  @AllowWithoutOrg()
  @ApiOkResponse({
    description: 'The new Organization and owner Membership.',
    standardSchema: onboardingSchema,
  })
  async onboarding(@RequestAccountId() accountId: string, @Body() dto: OnboardingDto) {
    return this.identity.onboarding(accountId, dto);
  }
}
