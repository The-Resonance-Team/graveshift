import {
  AnswerCommandSchema,
  FixNowCommandSchema,
  TriageCommandSchema,
  WORK_COMMAND_PATHS,
  WorkError,
  type WorkCommands,
} from '@graveshift/work';

import { bearerMatches, HttpFailure, jsonResponse, readJson, within } from './private-http';
import type { FetchHandler } from './routes';

export interface CommandOptions {
  commands: WorkCommands;
  projectId: string;
  token: string;
  maxBytes: number;
  timeoutMs: number;
}

export function createCommandHandler(options: CommandOptions): FetchHandler {
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (!Object.values(WORK_COMMAND_PATHS).some((entry) => entry === path)) {
      return jsonResponse({ message: 'Not found' }, 404);
    }
    if (!bearerMatches(request, options.token)) {
      return jsonResponse({ message: 'Internal authentication required' }, 401);
    }
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      return jsonResponse({ message: 'A JSON body is required' }, 415);
    }
    try {
      const raw = await readJson(request, options.maxBytes, options.timeoutMs);
      const schema =
        path === WORK_COMMAND_PATHS.triage
          ? TriageCommandSchema
          : path === WORK_COMMAND_PATHS['fix-now']
            ? FixNowCommandSchema
            : AnswerCommandSchema;
      const checked = schema.safeParse(raw);
      if (!checked.success) throw new HttpFailure(400, 'Invalid Work command');
      if (checked.data.caller.projectId !== options.projectId) {
        throw new WorkError('PROJECT_FORBIDDEN', 'Work item belongs to another project');
      }
      let result: Promise<unknown>;
      if (path === WORK_COMMAND_PATHS.triage) {
        const { caller, id, input } = TriageCommandSchema.parse(raw);
        result = options.commands.triage(caller, id, input);
      } else if (path === WORK_COMMAND_PATHS['fix-now']) {
        const { caller, id, input } = FixNowCommandSchema.parse(raw);
        result = options.commands.fixNow(caller, id, input);
      } else {
        const { caller, id, input } = AnswerCommandSchema.parse(raw);
        result = options.commands.answer(caller, id, input);
      }
      return jsonResponse(await within(result, options.timeoutMs));
    } catch (error) {
      if (error instanceof WorkError) return jsonResponse(error.toJSON(), error.status);
      if (error instanceof HttpFailure)
        return jsonResponse({ message: error.message }, error.status);
      return jsonResponse({ message: 'Work command failed' }, 502);
    }
  };
}
