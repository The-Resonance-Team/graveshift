import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { openDraftPr } from './open-pr';
import { renderPrBody } from './pr-body';
import { PatchRejectedError } from './guard';
import { callArg, diagnosis, fakeClient, file, incident, repo } from './test-helpers';
import type { Patch } from './types';

describe('openDraftPr', () => {
  const patch: Patch = {
    files: [
      { path: 'src/app.ts', content: 'fixed', linesChanged: 3 },
      { path: 'test/app.test.ts', content: 'test', linesChanged: 10 },
    ],
  };
  const input = {
    repo,
    patch,
    base: { sha: 'base-sha', treeSha: 'base-tree' },
    checks: [
      {
        command: ['bun', 'test'],
        exitCode: 0,
        timedOut: false,
        stdout: 'ok',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    ],
    diff: { filesChanged: 2, additions: 13, deletions: 0 },
    now: () => new Date('2026-11-22T00:00:00.000Z'),
    incident,
    diagnosis,
    category: 'code_bug',
    dashboardUrl: 'https://graveshift.example',
  };

  test('pushes a graveshift/ branch and opens a labelled draft PR against the pinned base', async () => {
    const { client, calls } = fakeClient();
    const pr = await openDraftPr({ client, ...input });
    expect(pr).toMatchObject({
      number: 42,
      branch: 'refs/heads/graveshift/inc-inc7f3a9-get-candies-id-calls-tofixed-on-a-null-p',
    });
    expect(calls.map((c) => c.method)).toEqual([
      'getBaseSha',
      'createBlob',
      'createBlob',
      'createTree',
      'createCommit',
      'createRef',
      'createPullRequest',
      'addLabels',
    ]);
    expect(callArg(calls, 'createTree', 1)).toBe('base-tree');
    expect(callArg(calls, 'createCommit', 3)).toBe('base-sha');
    const create = callArg(calls, 'createPullRequest', 1) as { draft: boolean; body: string };
    expect(create.draft).toBe(true);
    expect(create.body).toContain('`bun test`: passed');
    expect(create.body).toContain('+13/-0');
    expect(callArg(calls, 'addLabels', 2)).toEqual(['graveshift', 'exorcism']);
    expect(String(callArg(calls, 'createRef', 1))).toStartWith('refs/heads/graveshift/');
  });

  test('a base that moved after the fix read blocks every push', async () => {
    const { client, calls } = fakeClient();
    await expect(
      openDraftPr({ client, ...input, base: { sha: 'old-base-sha', treeSha: 'base-tree' } }),
    ).rejects.toMatchObject({ code: 'STALE_BASE' });
    expect(calls.map((c) => c.method)).toEqual(['getBaseSha']);
  });

  test('headline drives title, subject and slug while the body carries no diagnosis prose', async () => {
    const { client, calls } = fakeClient();
    const wrapped = '<untrusted_root_cause>\nhello world\n</untrusted_root_cause>';
    await openDraftPr({
      client,
      ...input,
      headline: 'hello world',
      diagnosis: { ...diagnosis, rootCause: wrapped },
    });
    const create = calls.find((c) => c.method === 'createPullRequest');
    const commit = calls.find((c) => c.method === 'createCommit');
    const ref = calls.find((c) => c.method === 'createRef');
    if (create === undefined || commit === undefined || ref === undefined) {
      throw new Error('expected the PR calls');
    }
    expect((create.args[1] as { title: string }).title).toBe('Exorcism: hello world');
    // The body carries identifiers, check results and diff stats only: no copy
    // of the root cause, the work item title or a Fix now note, wrapped or not.
    const body = (create.args[1] as { body: string }).body;
    expect(body).not.toContain(wrapped);
    expect(body).not.toContain('untrusted');
    expect(body).toContain('`bun test`: passed');
    expect(commit.args[1]).toBe('fix: hello world (incident inc-7f3a9c21-aaaa)');
    expect(ref.args[1]).not.toContain('untrusted');
  });

  test('property: a rejected patch makes zero client calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('deploy/x.yaml', '.github/ci.yml', 'src/k.pem', '../x'),
        async (bad) => {
          const { client, calls } = fakeClient();
          await expect(
            openDraftPr({ client, ...input, patch: { files: [file(bad)] } }),
          ).rejects.toBeInstanceOf(PatchRejectedError);
          expect(calls).toHaveLength(0);
        },
      ),
    );
  });

  test('rejects a service the repo does not cover, before any call', async () => {
    const { client, calls } = fakeClient();
    await expect(
      openDraftPr({ client, ...input, incident: { ...incident, service: 'postgres' } }),
    ).rejects.toMatchObject({ code: 'REPO_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });

  test('the client has no merge method and PR bodies are redacted', () => {
    const { client } = fakeClient();
    expect(Object.keys(client).filter((k) => /merge/i.test(k) && k !== 'getPullRequest')).toEqual(
      [],
    );
    const body = renderPrBody({
      incident,
      category: 'code_bug',
      confidence: diagnosis.confidence,
      dashboardUrl: 'https://g.example',
      files: ['src/app.ts'],
      checks: [
        {
          command: ['sh', '-c', 'echo ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
          exitCode: 1,
          timedOut: false,
          stdout: 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
          stderr: 'boom ghp_abcdefghijklmnopqrstuvwxyz0123456789',
          stdoutTruncated: false,
          stderrTruncated: true,
        },
      ],
      diff: { filesChanged: 1, additions: 1, deletions: 1 },
    });
    expect(body).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(body).toContain('[REDACTED:github_token]');
    expect(body).toContain('https://g.example/incidents/inc-7f3a9c21-aaaa');
    expect(body).toContain('never merged automatically');
    expect(body).toContain('exit 1');
    expect(body).toContain('(stderr capped at');
  });

  test('the body carries identifiers, checks and stats, never the diagnosis prose', () => {
    const body = renderPrBody({
      incident,
      category: 'code_bug',
      confidence: diagnosis.confidence,
      dashboardUrl: '',
      files: ['src/app.ts', 'src/price.ts'],
      checks: [
        {
          command: ['bun', 'test'],
          exitCode: null,
          timedOut: false,
          stdout: '',
          stderr: 'check runner failed: no jail',
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      ],
      diff: { filesChanged: 2, additions: 4, deletions: 1 },
    });
    expect(body).toContain('inc-7f3a9c21-aaaa');
    expect(body).toContain('**Service:** api');
    expect(body).toContain('**Category:** code_bug');
    expect(body).toContain('**Confidence:** 85%');
    expect(body).toContain('`bun test`: did not run');
    expect(body).toContain('(2 files, +4/-1)');
    // The work item title, the root cause and a Fix now note stay out.
    expect(body).not.toContain(diagnosis.rootCause);
    expect(body).not.toContain('TypeError');
    expect(body).not.toContain('log:2');
    expect(body).not.toContain('Fix now note');
  });

  test('an empty dashboard URL adds no broken link to the PR body', () => {
    const body = renderPrBody({
      incident,
      category: 'code_bug',
      confidence: diagnosis.confidence,
      dashboardUrl: '',
      files: ['src/app.ts'],
      checks: [],
      diff: { filesChanged: 1, additions: 1, deletions: 1 },
    });
    expect(body).not.toContain('/incidents/');
    expect(body).not.toContain('](');
    expect(body).toContain('never merged automatically');
    expect(body).toContain('- none configured');
  });
});
