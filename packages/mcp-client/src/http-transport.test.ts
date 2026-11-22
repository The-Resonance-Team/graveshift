import { describe, expect, test } from 'bun:test';

import { createGraveshiftMcp } from './client';
import { GraveshiftMcpAuthError, GraveshiftMcpTransportError } from './errors';
import { FAKE_TEST_TOKEN, connectFakeHttp, startFakeHttp } from './testing';

/**
 * Streamable HTTP transport coverage. The client runs the real
 * `StreamableHTTPClientTransport`; a fetch hook delivers every request to the
 * fake MCP handler in-process. No socket is opened and no live endpoint is hit.
 */
describe('streamable-http transport (in-process fake endpoint)', () => {
  test('a typed tool call travels over the real Streamable HTTP transport', async () => {
    const { mcp, http, close } = await connectFakeHttp({ credential: FAKE_TEST_TOKEN });
    try {
      const services = await mcp.listServices();
      expect(services[0]?.name).toBe('api');
      const incident = await mcp.getIncident({ id: 'inc1' });
      expect(incident.category).toBe('code_bug');
      const markdown = await mcp.readPostmortem('inc1');
      expect(markdown).toContain('# Autopsy: api (inc1)');
      expect(http.requestCount()).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  test('the caller credential rides every HTTP request as a bearer', async () => {
    const { mcp, http, close } = await connectFakeHttp({ credential: FAKE_TEST_TOKEN });
    try {
      await mcp.listServices();
      expect(http.seenAuthorizations.length).toBeGreaterThan(0);
      for (const authorization of http.seenAuthorizations) {
        expect(authorization).toBe(`Bearer ${FAKE_TEST_TOKEN}`);
      }
    } finally {
      await close();
    }
  });

  test('a per-call credential override applies to that call only', async () => {
    const { mcp, http, close } = await connectFakeHttp({
      credential: 'instance-token-unused-while-overridden',
      requireBearer: 'per-call-token',
    });
    try {
      const services = await mcp.listServices({ credential: 'per-call-token' });
      expect(services).toHaveLength(1);
      expect(http.seenAuthorizations.at(-1)).toBe('Bearer per-call-token');
    } finally {
      await close();
    }
  });

  test('a refused bearer raises GraveshiftMcpAuthError', async () => {
    const { mcp, close } = await connectFakeHttp({
      credential: 'wrong-token',
      requireBearer: 'right-token',
    });
    try {
      const error = await mcp.listServices().catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GraveshiftMcpAuthError);
      expect((error as GraveshiftMcpAuthError).retryable).toBe(false);
    } finally {
      await close();
    }
  });

  test('transport failures retry within the bound, then succeed', async () => {
    const http = await startFakeHttp({ requireBearer: FAKE_TEST_TOKEN, failFirstRequests: 2 });
    const mcp = createGraveshiftMcp({
      transport: 'streamable-http',
      url: http.url,
      fetch: http.fetch,
      credential: FAKE_TEST_TOKEN,
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    try {
      const services = await mcp.listServices();
      expect(services[0]?.status).toBe('healthy');
      // Two failing fetches, then one fresh connect whose handshake and call add more.
      expect(http.requestCount()).toBeGreaterThanOrEqual(3);
    } finally {
      await mcp.close();
      await http.close();
    }
  });

  test('retry is bounded: exhaustion raises GraveshiftMcpTransportError', async () => {
    const http = await startFakeHttp({ requireBearer: FAKE_TEST_TOKEN, failFirstRequests: 50 });
    const attempts: number[] = [];
    const mcp = createGraveshiftMcp({
      transport: 'streamable-http',
      url: http.url,
      fetch: http.fetch,
      credential: FAKE_TEST_TOKEN,
      maxRetries: 2,
      retryBaseDelayMs: 1,
      onRetry: (attempt) => {
        attempts.push(attempt);
      },
    });
    try {
      const error = await mcp.listServices().catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GraveshiftMcpTransportError);
      expect(attempts).toEqual([1, 2]);
      expect(http.requestCount()).toBe(3);
    } finally {
      await mcp.close();
      await http.close();
    }
  });

  test('a dead endpoint fails as a transport error, not a hang', async () => {
    const mcp = createGraveshiftMcp({
      transport: 'streamable-http',
      url: 'http://127.0.0.1:1/mcp',
      // fetch never reaches the network: it fails like a dead socket.
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
      credential: 'any',
      maxRetries: 0,
      timeoutMs: 1_000,
    });
    try {
      const error = await mcp.listServices().catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GraveshiftMcpTransportError);
    } finally {
      await mcp.close();
    }
  });
});
