import type { Actuator } from './execute';

export const MAX_ACTION_BODY_BYTES = 16 * 1024;

async function readBody(request: Request): Promise<string | Response> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_ACTION_BODY_BYTES) {
    await request.body?.cancel().catch(() => {});
    return Response.json({ error: 'too large' }, { status: 413 });
  }
  if (!request.body) return '';
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for await (const chunk of request.body) {
      bytes += chunk.byteLength;
      if (bytes > MAX_ACTION_BODY_BYTES) {
        return Response.json({ error: 'too large' }, { status: 413 });
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }
}

export function createActionHandler(actuator: Pick<Actuator, 'execute'>) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/healthz') {
      return Response.json({ status: 'ok' });
    }
    if (request.method !== 'POST' || pathname !== '/actions') {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const text = await readBody(request);
    if (text instanceof Response) return text;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const result = await actuator.execute(body);
    const status =
      result.reason === 'execution_uncertain' || result.reason === 'admission_unavailable'
        ? 503
        : result.status === 'executed'
          ? 200
          : result.status === 'denied'
            ? 403
            : result.reason === 'audit_unavailable'
              ? 503
              : 502;
    return Response.json(
      {
        status: result.status,
        reason: result.reason,
        auditStatus: result.auditStatus,
        ...(result.knownResult === undefined ? {} : { knownResult: result.knownResult }),
      },
      { status },
    );
  };
}
