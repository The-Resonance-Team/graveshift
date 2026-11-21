import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { credentialListSchema, issuedCredentialSchema } from '../auth.schema';
import type { CredentialMetadata, IssuedCredential, PrincipalRequest } from '../auth.types';
import { CreateCredentialDto } from '../dto/create-credential.dto';
import { CredentialParamsDto } from '../dto/credential-params.dto';
import { CredentialService } from '../services/credential.service';

@ApiTags('credentials')
@UseGuards(ThrottlerGuard, AuthGuard('oauth-client-credentials'))
@Controller('api/credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'The credential value is shown once. Store it now.',
    standardSchema: issuedCredentialSchema,
  })
  @ApiUnauthorizedResponse({ description: 'The client access token is not valid.' })
  create(
    @Body() body: CreateCredentialDto,
    @Req() request: PrincipalRequest,
  ): Promise<IssuedCredential> {
    return this.credentials.issue(body, request.user);
  }

  @Get()
  @ApiOkResponse({
    description: 'Metadata only. No value or hash is returned.',
    standardSchema: credentialListSchema,
  })
  list(@Req() request: PrincipalRequest): Promise<{ items: CredentialMetadata[] }> {
    return this.credentials.list(request.user).then((items) => ({ items }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The credential is revoked.' })
  @ApiNotFoundResponse({ description: 'The client does not own this credential.' })
  async revoke(
    @Param() params: CredentialParamsDto,
    @Req() request: PrincipalRequest,
  ): Promise<void> {
    await this.credentials.revoke(params.id, request.user);
  }
}
