import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

export class DockerSourceError extends GraveshiftError<
  'DOCKER_API_ERROR' | 'DOCKER_URL_REJECTED' | 'SERVICE_NOT_FOUND'
> {}

const ContainerSchema = z.object({
  Id: z.string(),
  Names: z.array(z.string()).default([]),
  Labels: z.record(z.string(), z.string()).default({}),
  State: z.string(),
});
export type Container = z.infer<typeof ContainerSchema>;

const InspectSchema = z.object({
  State: z.object({
    Status: z.string(),
    Running: z.boolean().default(false),
    OOMKilled: z.boolean().default(false),
    Health: z.object({ Status: z.string() }).optional(),
  }),
});
export type Inspect = z.infer<typeof InspectSchema>;

export const DockerEventSchema = z.object({
  Type: z.string(),
  Action: z.string(),
  Actor: z.object({ ID: z.string(), Attributes: z.record(z.string(), z.string()).default({}) }),
  time: z.number(),
  timeNano: z.number().optional(),
});
export type DockerEvent = z.infer<typeof DockerEventSchema>;

export const serviceName = (container: Container): string =>
  container.Labels['com.docker.compose.service'] ??
  (container.Names[0] ?? container.Id).replace(/^\//, '');

// Frames are [stream, 0, 0, 0, size(4, big-endian)] + payload unless the container has a TTY.
export function demuxLogs(raw: Uint8Array): string {
  const framed = raw.length >= 8 && raw[0]! <= 2 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0;
  if (!framed) return new TextDecoder().decode(raw);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset + 8 <= raw.length;) {
    const size = view.getUint32(offset + 4);
    parts.push(raw.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}

export class DockerApi {
  private readonly base: URL;
  private readonly fetchFn: typeof fetch;

  // Only the docker-socket-proxy URL is accepted; unix sockets and docker.sock paths never are (SEC-1).
  constructor(baseUrl: string, fetchFn: typeof fetch = fetch) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname.includes('docker.sock')) {
      throw new DockerSourceError(
        'DOCKER_URL_REJECTED',
        'Docker must be reached through the docker-socket-proxy HTTP URL',
      );
    }
    this.base = url;
    this.fetchFn = fetchFn;
  }

  private async get(
    path: string,
    params: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = new URL(path, this.base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await this.fetchFn(url, { method: 'GET', ...(signal ? { signal } : {}) });
    if (!res.ok)
      throw new DockerSourceError('DOCKER_API_ERROR', `docker api ${path} responded ${res.status}`);
    return res;
  }

  async containers(): Promise<Container[]> {
    const res = await this.get('/containers/json', { all: '1' });
    return z.array(ContainerSchema).parse(await res.json());
  }

  async inspect(id: string): Promise<Inspect> {
    return InspectSchema.parse(
      await (await this.get(`/containers/${encodeURIComponent(id)}/json`)).json(),
    );
  }

  async logs(id: string, lines: number): Promise<string[]> {
    const res = await this.get(`/containers/${encodeURIComponent(id)}/logs`, {
      stdout: '1',
      stderr: '1',
      tail: String(lines),
    });
    const text = demuxLogs(new Uint8Array(await res.arrayBuffer()));
    return text
      .split('\n')
      .filter((line) => line !== '')
      .slice(-lines);
  }

  async events(
    since: number | undefined,
    signal: AbortSignal,
    onOpen: () => void,
  ): Promise<AsyncIterable<DockerEvent>> {
    const params: Record<string, string> = { filters: JSON.stringify({ type: ['container'] }) };
    if (since !== undefined) params.since = String(since);
    const res = await this.get('/events', params, signal);
    onOpen();
    return parseEventStream(res.body);
  }
}

async function* parseEventStream(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<DockerEvent> {
  if (!body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      const parsed = DockerEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) yield parsed.data;
    }
  }
}
