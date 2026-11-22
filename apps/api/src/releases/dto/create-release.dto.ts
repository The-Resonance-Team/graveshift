import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const NUMERIC_ID = /^\d{1,20}$/;

export class CreateReleaseDto {
  @ApiProperty({ example: 'v3.2.0' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  version!: string;

  @ApiProperty({ type: [String], example: ['1001', '1002'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(NUMERIC_ID, { each: true })
  projects!: string[];
}
