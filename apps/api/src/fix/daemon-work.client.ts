import {
  FixResultSchema,
  TriageResultSchema,
  WORK_COMMAND_PATHS,
  WorkError,
  WorkErrorSchema,
  type AnswerBody,
  type FixNowBody,
  type FixResult,
  type TriageBody,
  type TriageResult,
  type WorkCaller,
  type WorkCommands,
} from '@graveshift/work';
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HttpClient, HttpResponseError, InjectHttpClient } from '@nestjs/http-client';
import type { z } from 'zod';

@Injectable()
export class DaemonWorkClient implements WorkCommands {
  constructor(@InjectHttpClient('daemon') private readonly http: HttpClient) {}

  triage(caller: WorkCaller, id: string, body: TriageBody): Promise<TriageResult> {
    return this.send(WORK_COMMAND_PATHS.triage, { caller, id, input: body }, TriageResultSchema);
  }

  fixNow(caller: WorkCaller, id: string, body: FixNowBody): Promise<FixResult> {
    return this.send(WORK_COMMAND_PATHS['fix-now'], { caller, id, input: body }, FixResultSchema);
  }

  answer(caller: WorkCaller, id: string, body: AnswerBody): Promise<FixResult> {
    return this.send(WORK_COMMAND_PATHS.answer, { caller, id, input: body }, FixResultSchema);
  }

  private async send<Result>(
    path: string,
    json: unknown,
    schema: z.ZodType<Result>,
  ): Promise<Result> {
    let data: unknown;
    try {
      const response = await this.http.post<unknown>(path, {
        json,
        retry: false,
        timeout: 300_000,
      });
      data = response.data;
    } catch (error) {
      if (error instanceof HttpResponseError) {
        const parsed = WorkErrorSchema.safeParse(error.body);
        if (parsed.success && parsed.data.status === error.status) {
          throw new WorkError(parsed.data.code, parsed.data.message);
        }
        throw new BadGatewayException('The daemon rejected the Work command');
      }
      throw new ServiceUnavailableException(
        'The daemon is unavailable. Retry with the same command ID',
      );
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new BadGatewayException('The daemon returned an invalid Work result');
    return parsed.data;
  }
}
