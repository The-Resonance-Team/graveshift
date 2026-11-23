import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const DEPLOYMENT_ID_PATTERN = /^[0-9a-f]{40}$/;
const NUMERIC_ID = /^\d{1,20}$/;

/** The Organization id and the Project id are bound by DeployAuthGuard. */
export class DeploymentParamsDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000000' })
  @IsString()
  @MinLength(1)
  orgId!: string;

  @ApiProperty({ example: '1001' })
  @IsString()
  @Matches(NUMERIC_ID)
  projectId!: string;
}

export class DeploymentListQueryDto {
  @ApiPropertyOptional({ description: 'The deployed commit SHA.', example: 'a'.repeat(40) })
  @IsOptional()
  @IsString()
  @Matches(DEPLOYMENT_ID_PATTERN)
  deploymentId?: string;

  @ApiPropertyOptional({ description: 'The Environment name on the Deployment.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  environment?: string;
}

export class CreateDeployDto {
  @ApiProperty({ description: 'The 40-hex deployed commit SHA.', example: 'a'.repeat(40) })
  @IsString()
  @Matches(DEPLOYMENT_ID_PATTERN)
  deploymentId!: string;

  @ApiProperty({ description: 'The commit or tag title.', example: 'fix: restart policy' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'The Environment name on the Deployment.', example: 'production' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  environment!: string;

  @ApiProperty({ example: '2026-11-22T07:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  dateStarted!: Date;

  @ApiPropertyOptional({ example: '2026-11-22T07:05:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFinished?: Date;

  @ApiPropertyOptional({ example: 'https://ci.example.test/runs/42' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;
}
