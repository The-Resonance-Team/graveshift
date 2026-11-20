// Real-model diagnosis harness. Seam: the public diagnose({ gateway }, input) call.
// Usage: bun apps/_daemon/scripts/diagnose-real-model.ts --round <n> [--baseline] [--label <text>]
//   --baseline  no providers, rules-only results (round 0)
// Credentials come from the environment (Bun loads the gitignored .env). Nothing secret is printed.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildContext,
  type Category,
  type DiagnoseInput,
  diagnose,
  type DiagnoseResult,
} from '@graveshift/diagnoser';
import type { AuditEvent } from '@graveshift/llm';
import { loadPolicy } from '@graveshift/policy';
import { redact } from '@graveshift/redactor';

import { createDiagnosisGateway } from '../src/llm';

const root = resolve(import.meta.dir, '../../..');
const fixtureDir = resolve(root, 'packages/diagnoser/fixtures');
const outPath = resolve(root, 'docs/reports/real-model-results.jsonl');

const CASES: Array<{ id: string; expected: Category }> = [
  { id: 'null-candy', expected: 'code_bug' },
  { id: 'memory-leech', expected: 'resource_exhaustion' },
  { id: 'wrong-potion', expected: 'config_error' },
];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args[args.indexOf(`--${name}`) + 1];
const baseline = flag('baseline');
const round = Number(value('round') ?? (baseline ? 0 : 1));
const label = flag('label') ? (value('label') ?? '') : '';
const env = process.env;

const excerpt = (text: string, max = 120) => redact(text).replace(/\s+/g, ' ').slice(0, max);

// a secret leaks when the redactor would change the text or a live credential value appears in it
const liveSecrets = [env.OPENAI_COMPATIBLE_API_KEY, env.HAUNT_TOKEN].filter(
  (s): s is string => Boolean(s) && (s as string).length >= 8,
);
const leaks = (text: string) => redact(text) !== text || liveSecrets.some((s) => text.includes(s));

const policy = await loadPolicy(resolve(root, 'policy.example.yaml'));

const audits: AuditEvent[] = [];
const { gateway } = await createDiagnosisGateway(
  resolve(root, 'graveshift.config.example.yaml'),
  baseline ? {} : env,
  policy.limits.llmDailyBudgetUsd,
  (event) => audits.push(event as AuditEvent),
);

mkdirSync(dirname(outPath), { recursive: true });
let failed = 0;

// Cases run one after another on purpose: latency is measured per call and
// calls share one gateway budget. The scoped lint override in .oxlintrc.json covers this loop.
for (const { id, expected } of CASES) {
  const fixture = (await Bun.file(resolve(fixtureDir, `${id}.json`)).json()) as {
    input: DiagnoseInput;
  };
  const bundle = buildContext(fixture.input);
  const started = performance.now();
  const result: DiagnoseResult = await diagnose({ gateway }, fixture.input);
  const latencyMs = Math.round(performance.now() - started);
  const audit = audits.at(-1);

  const base = {
    case: id,
    round,
    label,
    expected,
    latencyMs,
    mode: baseline ? 'rules-only' : 'llm',
  };
  let row: Record<string, unknown>;
  if (result.status === 'needs_human') {
    row = {
      ...base,
      actual: null,
      source: null,
      confidence: null,
      evidence: [],
      groundedRefs: false,
      secretLeak: false,
      pass: false,
      reason: excerpt(result.reason),
    };
  } else {
    const { diagnosis, category, source } = result;
    const refs = diagnosis.evidence.map((e) => e.ref);
    const outputText = [
      diagnosis.rootCause,
      ...diagnosis.evidence.map((e) => `${e.ref} ${e.excerpt}`),
    ].join('\n');
    const grounded = refs.every((r) => bundle.refs.has(r));
    const secretLeak = leaks(outputText);
    row = {
      ...base,
      actual: category,
      source,
      usedLlm: source === 'llm',
      confidence: diagnosis.confidence,
      rootCause: excerpt(diagnosis.rootCause, 160),
      evidence: diagnosis.evidence.map((e) => ({ ref: e.ref, excerpt: excerpt(e.excerpt, 80) })),
      groundedRefs: grounded,
      secretLeak,
      pass: category === expected && grounded && !secretLeak,
    };
  }
  if (audit)
    row.llm = { status: audit.status, tokensIn: audit.tokensIn, tokensOut: audit.tokensOut };
  if (!row.pass) failed += 1;
  appendFileSync(outPath, `${JSON.stringify(row)}\n`);
  console.warn(
    `[round ${round}] ${id}: ${String(row.actual)} (want ${expected}) source=${String(row.source)} grounded=${String(row.groundedRefs)} leak=${String(row.secretLeak)} ${latencyMs}ms -> ${row.pass ? 'PASS' : 'FAIL'}`,
  );
}

console.warn(`round ${round}: ${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed === 0 ? 0 : 1);
