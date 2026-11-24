import { z } from 'zod';

import { bearerMatches, HttpFailure, jsonResponse, readJson, within } from './private-http';
import type { ReadRuntime } from './reads';
import type { FetchHandler } from './routes';

const project = { projectId: z.string().min(1) };
const ref = { ...project, id: z.string().min(1).max(200) };
const ReadCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('services'), body: z.object(project).strict() }).strict(),
  z.object({ action: z.literal('incidents'), body: z.object(project).strict() }).strict(),
  z.object({ action: z.literal('incident'), body: z.object(ref).strict() }).strict(),
  z
    .object({
      action: z.literal('context'),
      body: z.object({ ...project, incidentId: z.string().min(1).max(200) }).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('logs'),
      body: z
        .object({
          ...project,
          service: z.string().min(1).max(200),
          lines: z.number().int().min(1).max(300),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('metric'),
      body: z.object({ ...project, promql: z.string().min(1).max(2000) }).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('counters'),
      body: z.object({ ...project, incidentId: z.string().min(1).max(200) }).strict(),
    })
    .strict(),
]);

export interface ReadHandlerOptions {
  reads: ReadRuntime;
  /** ADR 0023: every granted Project may be read; the boot Project is not a scope floor. */
  projectIds: readonly string[];
  token: string;
  timeoutMs: number;
  maxBytes: number;
}

export function createReadHandler(options: ReadHandlerOptions): FetchHandler {
  return async (request) => {
    if (!bearerMatches(request, options.token))
      return jsonResponse({ message: 'Internal authentication required' }, 401);
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      return jsonResponse({ message: 'A JSON body is required' }, 415);
    }
    try {
      const action = new URL(request.url).pathname.replace('/internal/read/', '');
      if (!ReadCommandSchema.options.some((schema) => schema.shape.action.value === action)) {
        throw new HttpFailure(404, 'Private read not found');
      }
      const body = await readJson(request, options.maxBytes, options.timeoutMs);
      const checked = ReadCommandSchema.safeParse({ action, body });
      if (!checked.success) throw new HttpFailure(400, 'Invalid read command');
      const command = checked.data;
      if (!options.projectIds.includes(command.body.projectId))
        throw new HttpFailure(403, 'Project is unavailable');
      const projectId = command.body.projectId;
      let result: Promise<unknown>;
      switch (command.action) {
        case 'services':
          result = options.reads.services(projectId);
          break;
        case 'incidents':
          result = options.reads.incidents(projectId);
          break;
        case 'incident':
          result = options.reads.incident(projectId, command.body.id);
          break;
        case 'context':
          result = options.reads.context(projectId, command.body.incidentId);
          break;
        case 'logs':
          result = options.reads.logs(command.body.service, command.body.lines);
          break;
        case 'metric':
          result = options.reads.metric(command.body.promql);
          break;
        case 'counters':
          result = options.reads.counters(projectId, command.body.incidentId);
          break;
      }
      return jsonResponse(await within(result, options.timeoutMs));
    } catch (error) {
      if (error instanceof HttpFailure)
        return jsonResponse({ message: error.message }, error.status);
      return jsonResponse({ message: 'Private read failed' }, 502);
    }
  };
}
