import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class SentryParamsDto {
  @ApiProperty({ description: 'The numeric project id in the Sentry DSN.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\d+$/)
  projectId!: string;
}
