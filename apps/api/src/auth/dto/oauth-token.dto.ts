import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class OAuthTokenDto {
  @ApiProperty({ enum: ['client_credentials'] })
  @IsIn(['client_credentials'])
  grant_type!: 'client_credentials';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  client_secret!: string;
}
