import { WorkError, WorkErrorSchema } from '@graveshift/work';
import type { z } from 'zod';

import { HttpFailure, readJson } from './private-http';
import { InternalOriginSchema } from './config';

export interface PrivateApi {
  get<Value>(path: string, schema: z.ZodType<Value>): Promise<Value>;
  post<Value>(path: string, body: unknown, schema: z.ZodType<Value>): Promise<Value>;
}

export interface ApiOptions {
  origin: string;
  token: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export function createPrivateApi(options: ApiOptions): PrivateApi {
  const fetcher = options.fetch ?? fetch;
  const origin = new URL(InternalOriginSchema.parse(options.origin));
  async function request<Value>(path: string, schema: z.ZodType<Value>, body?: unknown) {
    const url = new URL(path, origin);
    if (url.origin !== origin.origin || !path.startsWith('/internal/')) {
      throw new Error('Private API path is invalid');
    }
    const response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const value = await readJson(response, 4_194_304, options.timeoutMs);
    if (!response.ok) {
      const error = WorkErrorSchema.safeParse(value);
      if (error.success) throw new WorkError(error.data.code, error.data.message);
      throw new HttpFailure(response.status, 'Private API request failed');
    }
    const result = schema.safeParse(value);
    if (!result.success) throw new HttpFailure(502, 'Invalid private API response');
    return result.data;
  }
  return {
    get: (path, schema) => request(path, schema),
    post: (path, body, schema) => request(path, schema, body),
  };
}
