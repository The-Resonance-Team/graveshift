import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { oauthTokenSchema } from '../auth.schema';
import { OAuthTokenDto } from '../dto/oauth-token.dto';
import { OAuthTokenService } from '../services/oauth-token.service';

@ApiTags('oauth')
@Controller('api/oauth')
export class OAuthController {
  constructor(private readonly tokens: OAuthTokenService) {}

  @Post('token')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'A short-lived client-credentials token.',
    standardSchema: oauthTokenSchema,
  })
  @ApiUnauthorizedResponse({ description: 'The client id or secret is not valid.' })
  @ApiTooManyRequestsResponse({ description: 'The client reached its request rate limit.' })
  async token(@Body() body: OAuthTokenDto): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
  }> {
    const issued = await this.tokens.exchange(body.client_id, body.client_secret);
    return { ...issued, token_type: 'Bearer' };
  }
}
