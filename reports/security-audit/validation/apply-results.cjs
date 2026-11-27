const fs = require('node:fs');
const path = require('node:path');
const validator = require('/Users/xirothedev/.agents/skills/security-audit/validate-findings.cjs');
const schema = JSON.parse(fs.readFileSync('/Users/xirothedev/.agents/skills/security-audit/report-schema.json', 'utf8'));

const base = __dirname;
const meta = JSON.parse(fs.readFileSync(path.join(base, 'confirmation-meta.json'), 'utf8'));
const records = JSON.parse(fs.readFileSync(path.join(base, '..', 'findings.json'), 'utf8'));
const results = [];
for (const file of fs.readdirSync(path.join(base, 'results'))) {
  if (!file.endsWith('.json')) continue;
  const result = JSON.parse(fs.readFileSync(path.join(base, 'results', file), 'utf8'));
  if (result && typeof result.lead === 'string' && typeof result.verdict === 'string') results.push({file, ...result});
}
const byLead = new Map(results.map(item => [item.lead, item]));
const outputs = [];

for (const record of records) {
  const result = byLead.get(record.fingerprint);
  if (!result) { outputs.push(record); continue; }
  const details = meta[record.fingerprint] ?? {};
  if (result.verdict === 'confirmed') {
    const {claimed_root_cause, blockers, validation_plan, verdict, ...rest} = record;
    outputs.push({
      ...rest,
      verdict: 'confirmed',
      root_cause: claimed_root_cause,
      intended_behavior: details.intended_behavior ?? `The source-visible control named by this title must hold for every lower-trust principal and resource; the observed result violates it.`,
      conditions: details.conditions ?? [{kind: 'system_configuration', description: 'The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.'}],
      execution: {
        attacker_perspective: details.attacker_perspective ?? 'Holder of the lower-trust capability described in the title.',
        payloads: [JSON.stringify(result.observed).slice(0, 2000)],
        instructions: [`Run ${result.file.replace(/\.json$/, '.ts')} inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.`],
        observed_result: result.reason,
      },
      remediation: {strategy: details.remediation ?? 'Enforce the missing boundary at the last trusted decision point named in the trace, with a regression test using two dummy principals.'},
      severity: details.severity ?? {likelihood: {score: 'medium', reason: 'The result requires the documented dummy-fixture preconditions.'}, impact: {score: 'medium', reason: 'The demonstrated result crosses the named boundary for dummy data.'}, overall_severity: 'medium'},
      confidence: {score: 'high', reason: 'The minimum boundary result was observed in a compliant container with dummy data.'},
    });
  } else if (result.verdict === 'rejected') {
    outputs.push({
      verdict: 'rejected',
      fingerprint: record.fingerprint,
      title: record.title,
      description: record.description,
      claimed_root_cause: record.claimed_root_cause,
      trace: record.trace,
      evidence: record.evidence,
      reason: `Bounded local check refuted the hypothesis: ${result.reason}`,
    });
  } else {
    outputs.push({
      ...record,
      blockers: [...record.blockers, `Bounded local harness ${result.file} remained inconclusive: ${result.reason}`],
    });
  }
}
outputs.sort((a, b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0);
const errors = validator.validateDocument(outputs, schema);
if (errors.length) throw new Error(errors.join('\n'));
fs.writeFileSync(path.join(base, '..', 'findings.json'), `${JSON.stringify(outputs, null, 2)}\n`);
fs.writeFileSync(path.join(base, 'validation-results.json'), `${JSON.stringify(results, null, 2)}\n`);
const counts = {};
for (const item of outputs) counts[item.verdict] = (counts[item.verdict] ?? 0) + 1;
console.log(`Applied ${results.length} bounded results: ${JSON.stringify(counts)}`);
