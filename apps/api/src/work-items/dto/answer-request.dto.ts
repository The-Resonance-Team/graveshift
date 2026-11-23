import { AnswerBodySchema, type AnswerBody } from '@graveshift/work';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

import { WorkValue } from './work-value';

export class AnswerRequestDto implements AnswerBody {
  @ApiProperty({ type: String, minLength: 1 })
  @IsString()
  @MinLength(1)
  attemptId!: string;

  @ApiProperty({ type: String, minLength: 1 })
  @IsString()
  @MinLength(1)
  questionId!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string', maxLength: 10_000 } })
  @WorkValue(AnswerBodySchema.shape.params)
  params!: Record<string, string>;
}
