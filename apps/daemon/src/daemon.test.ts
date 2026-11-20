import { describe, expect, test } from 'bun:test';

import { newLines } from './feeders';
import type { IncidentView } from './registry';
import { get, oom, stack } from './test-helpers';

const TYPE_ERROR = JSON.stringify({
  level: 'error',
  message: "TypeError: null is not an object (evaluating 'candy.price.toFixed')",
});

describe('flow: watcher -> diagnoser -> policy -> fixer -> audit', () => {
  test('an OOM opens an incident, diagnoses it rules-only and audits every step', async () => {
    const s = stack();
    s.watcher.ingest(oom());
    await s.settle();
    const [view] = s.registry.list();
    expect(view?.incident.state).toBe('diagnosed');
    expect(view?.category).toBe('resource_exhaustion');
    expect(view?.diagnosisSource).toBe('rules-only');
    const types = (await s.audit.list()).map((e) => e.type);
    expect(types).toEqual(['incident.opened', 'diagnosis.created', 'policy.decision']);
    expect((await s.audit.verifyChain()).ok).toBe(true);
  });

  test('a code bug in propose mode opens a draft PR through the injected fixer', async () => {
    const opened: string[] = [];
    const s = stack({
      logs: Array.from({ length: 5 }, () => TYPE_ERROR),
      flow: {
        openFix: async ({ incident, category }) => {
          opened.push(`${incident.id}:${category}`);
          return {
            repo: 'xiro/haunted-candy-shop',
            number: 7,
            url: 'https://github.com/xiro/haunted-candy-shop/pull/7',
            branch: 'refs/heads/graveshift/inc-1-x',
            headSha: 'abc',
          };
        },
      },
    });
    for (let i = 0; i < 5; i++) s.watcher.log('api', TYPE_ERROR, `2026-11-20T10:00:0${i}.000Z`);
    await s.settle();
    expect(opened).toEqual(['inc-1:code_bug']);
    const view = s.registry.get('inc-1');
    expect(view?.pr?.number).toBe(7);
    expect((await s.audit.list()).map((e) => e.type)).toContain('pr.opened');
    expect(await (await get(s.handle, '/api/incidents/inc-1/pr')).json()).toMatchObject({
      number: 7,
    });
  });

  test('a policy that does not allow open_pr never calls the fixer', async () => {
    let called = false;
    const s = stack({ flow: { openFix: async () => ((called = true), null) } });
    s.watcher.ingest(oom());
    await s.settle();
    expect(called).toBe(false);
    expect(
      s.registry
        .get('inc-1')
        ?.timeline.some((t) => t.type === 'policy' && t.detail.startsWith('open_pr: deny')),
    ).toBe(true);
  });

  test('needs_human leaves the incident open and is audited', async () => {
    const s = stack({
      flow: { diagnose: async () => ({ status: 'needs_human', reason: 'evidence ref unseen' }) },
    });
    s.watcher.ingest(oom());
    await s.settle();
    expect(s.registry.get('inc-1')).toMatchObject({
      needsHuman: 'evidence ref unseen',
      incident: { state: 'open' },
    });
    expect((await s.audit.list()).map((e) => e.type)).toContain('diagnosis.needs_human');
  });

  test('later signals join the incident without re-diagnosing it', async () => {
    let diagnoses = 0;
    const s = stack();
    const original = s.registry.setDiagnosis;
    s.registry.setDiagnosis = (...args) => {
      diagnoses += 1;
      original(...args);
    };
    s.watcher.ingest(oom());
    await s.settle();
    const first = oom();
    if (first.kind !== 'signal') throw new Error('fixture');
    s.watcher.ingest({
      ...first,
      signal: { ...first.signal, id: 's2', kind: 'image_pull_backoff', fingerprint: 'worker:img' },
    });
    await s.settle();
    expect(diagnoses).toBe(1);
    expect(s.registry.get('inc-1')?.incident.signalIds).toHaveLength(2);
  });

  test('audit payloads are redacted', async () => {
    const s = stack({
      flow: {
        diagnose: async () => ({ status: 'needs_human', reason: 'DB_PASSWORD=hunter22 leaked' }),
      },
    });
    s.watcher.ingest(oom());
    await s.settle();
    expect(JSON.stringify(await s.audit.list())).not.toContain('hunter22');
  });
});

describe('http api', () => {
  test('graveyard joins services, health and open incidents', async () => {
    const s = stack();
    s.watcher.ingest(oom());
    await s.settle();
    const graves = (await (await get(s.handle, '/api/graveyard')).json()) as Array<
      Record<string, unknown>
    >;
    expect(graves).toEqual([
      { name: 'api', runtime: 'docker', health: 'healthy' },
      {
        name: 'worker',
        runtime: 'docker',
        health: 'healthy',
        incidentId: 'inc-1',
        severity: 'critical',
        state: 'diagnosed',
      },
    ]);
  });

  test('incidents, timeline, mode, audit and verify endpoints', async () => {
    const s = stack();
    s.watcher.ingest(oom());
    await s.settle();
    const incidents = (await (await get(s.handle, '/api/incidents')).json()) as IncidentView[];
    expect(incidents.map((v) => v.incident.id)).toEqual(['inc-1']);
    const timeline = (await (
      await get(s.handle, '/api/incidents/inc-1/timeline')
    ).json()) as Array<{ type: string }>;
    expect(timeline.map((t) => t.type)).toEqual([
      'signal.runtime.oom',
      'state.diagnosing',
      'diagnosis',
      'state.diagnosed',
      'policy',
    ]);
    expect(await (await get(s.handle, '/api/mode')).json()).toEqual({
      policy: 'propose',
      effective: 'propose',
    });
    expect(((await (await get(s.handle, '/api/audit?limit=2')).json()) as unknown[]).length).toBe(
      2,
    );
    expect(await (await get(s.handle, '/api/audit/verify')).json()).toEqual({
      ok: true,
      length: 3,
    });
    expect((await get(s.handle, '/api/incidents/nope')).status).toBe(404);
    expect((await get(s.handle, '/healthz')).status).toBe(200);
  });

  test('SSE delivers an incident update in under 1 s', async () => {
    const s = stack();
    const controller = new AbortController();
    const res = await s.handle(
      new Request('http://daemon/api/events', { signal: controller.signal }),
    );
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const started = performance.now();
    s.watcher.ingest(oom());
    const readUntil = async (text: string): Promise<string> =>
      text.includes('event: incident')
        ? text
        : readUntil(text + decoder.decode((await reader.read()).value));
    const text = await readUntil('');
    const elapsed = performance.now() - started;
    controller.abort();
    await s.settle();
    expect(text).toContain('event: hello');
    expect(text).toContain('inc-1');
    expect(elapsed).toBeLessThan(1000);
  });

  test('haunt forwards to the right demo process with the token and is rate limited', async () => {
    const forwarded: Array<{ url: string; token: string | null }> = [];
    let now = 0;
    const fetchFn = (async (url: URL, init: RequestInit) => {
      forwarded.push({
        url: url.toString(),
        token: new Headers(init.headers).get('x-haunt-token'),
      });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const s = stack({
      http: {
        haunt: {
          apiUrl: 'http://api:3000',
          workerUrl: 'http://worker:3001',
          token: 'demo-token',
          minIntervalMs: 30_000,
        },
        fetch: fetchFn,
        now: () => now,
      },
    });
    const post = (scenario: string) =>
      s.handle(
        new Request('http://daemon/api/haunt', {
          method: 'POST',
          body: JSON.stringify({ scenario }),
        }),
      );
    expect((await post('null-candy')).status).toBe(202);
    expect((await post('wrong-potion')).status).toBe(429);
    now = 30_000;
    expect((await post('memory-leech')).status).toBe(202);
    expect((await post('nope')).status).toBe(400);
    expect(forwarded).toEqual([
      { url: 'http://api:3000/__haunt', token: 'demo-token' },
      { url: 'http://worker:3001/__haunt', token: 'demo-token' },
    ]);
    expect((await s.audit.list()).map((e) => e.type)).toEqual(['demo.haunt', 'demo.haunt']);
  });

  test('haunt is off without a token', async () => {
    const s = stack();
    expect(
      (
        await s.handle(
          new Request('http://daemon/api/haunt', {
            method: 'POST',
            body: '{"scenario":"null-candy"}',
          }),
        )
      ).status,
    ).toBe(404);
  });
});

describe('log diffing', () => {
  test('returns only lines after the previous tail', () => {
    expect(newLines(['a', 'b', 'c'], ['b', 'c', 'd', 'e'])).toEqual(['d', 'e']);
    expect(newLines(['a'], ['a'])).toEqual([]);
    expect(newLines(['x'], ['y', 'z'])).toEqual(['y', 'z']);
  });
});
