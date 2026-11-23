import {
  AbandonSchema,
  AbortPublicationSchema,
  ApplyAnswerSchema,
  BeginPublicationSchema,
  ClaimFixSchema,
  FinishAttemptSchema,
  HeartbeatSchema,
  RecordPublicationSchema,
  SaveQuestionSchema,
  SaveTriageSchema,
  WorkCallerSchema,
  WorkRequestSchema,
  type ApplyAnswer,
  type Abandon,
  type AbortPublication,
  type BeginPublication,
  type ClaimFix,
  type FinishAttempt,
  type Heartbeat,
  type RecordPublication,
  type SaveQuestion,
  type SaveTriage,
  type WorkCaller,
  type WorkRequest,
} from '@graveshift/work';
import { IsString, MinLength } from 'class-validator';

import { WorkValue } from './work-value';

export class ReadWorkDto {
  @IsString()
  @MinLength(1)
  projectId!: string;
}

class CallerWorkDto {
  @WorkValue(WorkCallerSchema)
  caller!: WorkCaller;
}

export class ReplayWorkDto extends CallerWorkDto {
  @WorkValue(WorkRequestSchema)
  request!: WorkRequest;
}

export class SaveTriageDto extends CallerWorkDto {
  @WorkValue(SaveTriageSchema)
  input!: SaveTriage;
}

export class ClaimFixDto extends CallerWorkDto {
  @WorkValue(ClaimFixSchema)
  input!: ClaimFix;
}

export class SaveQuestionDto extends CallerWorkDto {
  @WorkValue(SaveQuestionSchema)
  input!: SaveQuestion;
}

export class ApplyAnswerDto extends CallerWorkDto {
  @WorkValue(ApplyAnswerSchema)
  input!: ApplyAnswer;
}

export class BeginPublicationDto extends CallerWorkDto {
  @WorkValue(BeginPublicationSchema)
  input!: BeginPublication;
}

export class RecordPublicationDto extends CallerWorkDto {
  @WorkValue(RecordPublicationSchema)
  input!: RecordPublication;
}

export class FinishAttemptDto extends CallerWorkDto {
  @WorkValue(FinishAttemptSchema)
  input!: FinishAttempt;
}

export class HeartbeatDto extends CallerWorkDto {
  @WorkValue(HeartbeatSchema)
  input!: Heartbeat;
}

export class AbandonDto extends CallerWorkDto {
  @WorkValue(AbandonSchema)
  input!: Abandon;
}

export class AbortPublicationDto extends CallerWorkDto {
  @WorkValue(AbortPublicationSchema)
  input!: AbortPublication;
}
