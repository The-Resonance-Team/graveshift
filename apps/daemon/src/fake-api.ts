import type { PrivateApi } from './api-client';

export function fakeApi(
  handle: (path: string, body?: unknown) => unknown | Promise<unknown>,
): PrivateApi {
  return {
    get: async (path, schema) => schema.parse(await handle(path)),
    post: async (path, body, schema) => schema.parse(await handle(path, body)),
  };
}
