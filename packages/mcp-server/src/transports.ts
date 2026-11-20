import { timingSafeEqual } from 'node:crypto';

import type { Handler } from './protocol';

/** Newline-delimited JSON-RPC over stdio. */
export async function serveStdio(
  handle: Handler,
  input: AsyncIterable<Uint8Array> = Bun.stdin.stream(),
  write: (line: string) => void = (line) => void process.stdout.write(line),
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  const lineOut = async (line: string) => {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`,
      );
      return;
    }
    const reply = await handle(message);
    if (reply !== undefined) write(`${JSON.stringify(reply)}\n`);
  };
  for await (const chunk of input) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      // oxlint-disable-next-line no-await-in-loop -- requests must be answered in order
      await lineOut(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
  }
  await lineOut(buffer);
}

const MAX_BODY_BYTES = 64 * 1024;

function authorized(header: string | null, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, '') ?? '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Streamable HTTP, JSON response mode only (POST /mcp). Code only, not deployed.
 * ponytail: no SSE stream or sessions, upgrade when server-initiated messages are needed.
 */
export function createHttpHandler(handle: Handler, token: string) {
  if (token.length < 32) throw new Error('GRAVESHIFT_MCP_TOKEN must be at least 32 characters');
  return async (req: Request): Promise<Response> => {
    if (new URL(req.url).pathname !== '/mcp') return new Response('not found', { status: 404 });
    if (!authorized(req.headers.get('authorization'), token)) {
      return new Response('unauthorized', {
        status: 401,
        headers: { 'www-authenticate': 'Bearer' },
      });
    }
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return new Response('too large', { status: 413 });
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return Response.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } },
        { status: 400 },
      );
    }
    const reply = await handle(message);
    return reply === undefined ? new Response(null, { status: 202 }) : Response.json(reply);
  };
}
