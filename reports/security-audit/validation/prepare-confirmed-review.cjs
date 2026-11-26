const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const run = path.join(base, '..');
const records = JSON.parse(fs.readFileSync(path.join(run, 'findings.json'), 'utf8')).filter(r => r.verdict === 'confirmed');
const schema = fs.readFileSync('/Users/xirothedev/.agents/skills/security-audit/report-schema.json', 'utf8');
const listings = [];
for (let index = 0; index < records.length; index++) {
  const record = records[index];
  const agentId = `confirm-${String(index + 1).padStart(2, '0')}`;
  const root = path.join(run, 'agents', agentId);
  fs.mkdirSync(path.join(root, 'scratch'), {recursive: true});
  fs.mkdirSync(path.join(root, 'artifacts'), {recursive: true});
  const observedFile = path.join(base, 'results', `${path.basename((record.execution.instructions[0] ?? '').match(/Run ([^ ]+)/)?.[1] ?? '')}`);
  const harnessName = (record.execution.instructions[0] ?? '').match(/Run (\S+)/)?.[1] ?? '';
  const resultFile = path.join(base, 'results', harnessName.replace(/\.ts$/, '.json'));
  const observed = fs.existsSync(resultFile) ? fs.readFileSync(resultFile, 'utf8') : 'MISSING';
  const prompt = [
    `You are a fresh independent verifier ${agentId} of a newly confirmed finding. Verify the record and its bounded local evidence from source; do not merely accept the harness claim.`,
    `Target: /Users/xirothedev/workspace/graveshift\nAgent ID: ${agentId}\nDo not execute project code, tests, builds, or network requests. Do not read ignored secrets/local settings. Do not edit target source or shared audit files.`,
    `Confirmed record under review:\n${JSON.stringify(record, null, 2)}`,
    `Observed bounded result from the compliant container:\n${observed}`,
    `Harness source: ${path.join(base, harnessName)}. Read it. Container controls are in ${path.join(base, 'run-check.sh')} and ${path.join(base, 'CONTRACT.md')}; read both and confirm the harness used only dummy data, no network, read-only target, scratch-only bounded writes, 512 MiB memory, 1 CPU, 64 pids, and a hard timeout.`,
    `Report schema (confirmed branch) copied verbatim:\n${schema}`,
    `Check every repository-relative trace/evidence path, line, scope and described operation; confirm the entry point is a real lower-trust principal, the last item is the claimed sink, and the observed result proves that exact invariant. Check that likelihood, impact and overall severity do not exceed the demonstrated dummy-data result, and that remediation enforces the invariant at the named decision point. A source/error correction that does not change verdict, result, impact or severity may be returned as a replace record. If the evidence does not support confirmation, return rejected with a reason.`,
    `Save your exact JSON to ${root}/scratch/source-result.json and return the same JSON. Return exactly {"decision":"verified","fingerprint":"..."} or {"decision":"replace","reason":"...","record":{...}} or {"decision":"rejected","reason":"..."} with no surrounding prose.`,
  ].join('\n\n');
  fs.writeFileSync(path.join(root, 'scratch', 'assignment.md'), prompt);
  listings.push({agent_id: agentId, fingerprint: record.fingerprint, prompt: path.join(root, 'scratch', 'assignment.md')});
}
fs.writeFileSync(path.join(run, 'confirmed-review-assignments.json'), `${JSON.stringify(listings, null, 2)}\n`);
console.log(`Prepared ${listings.length} fresh confirmed-record verifiers`);
