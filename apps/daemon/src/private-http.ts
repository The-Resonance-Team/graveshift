import { createHash, timingSafeEqual } from 'node:crypto';

export class HttpFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function bearerMatches(request: Request, expected: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  return timingSafeEqual(digest(provided), digest(expected)) && provided.length > 0;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function within<Value>(work: Promise<Value>, timeoutMs: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new HttpFailure(504, 'Private request timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson(
  message: Request | Response,
  maxBytes: number,
  timeoutMs: number,
): Promise<unknown> {
  const length = message.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new HttpFailure(413, 'Private request body is too large');
  }
  const reader = message.body?.getReader();
  if (reader === undefined) throw new HttpFailure(400, 'A JSON body is required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const collect = async (): Promise<void> => {
    const next = await reader.read();
    if (next.done) return;
    size += next.value.byteLength;
    if (size > maxBytes) throw new HttpFailure(413, 'Private request body is too large');
    chunks.push(next.value);
    return collect();
  };
  const consume = async () => {
    await collect();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw new HttpFailure(400, 'Invalid JSON body');
    }
  };
  try {
    return await within(consume(), timeoutMs);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  }
}
