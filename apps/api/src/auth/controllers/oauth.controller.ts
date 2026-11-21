import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { oauthTokenSchema } from '../auth.schema';
import { OAuthTokenDto } from '../dto/oauth-token.dto';
import { OAuthTokenService } from '../services/oauth-token.service';

@ApiTags('oauth')
@Controller('api/oauth')
export class OAuthController {
  constructor(private readonly tokens: OAuthTokenService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'A short-lived client-credentials token.',
    standardSchema: oauthTokenSchema,
  })
  @ApiUnauthorizedResponse({ description: 'The client id or secret is not valid.' })
  async token(@Body() body: OAuthTokenDto): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
  }> {
    const access_token = await this.tokens.exchange(body.client_id, body.client_secret);
    return { access_token, token_type: 'Bearer', expires_in: 300 };
  }
}
