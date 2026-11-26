const fs = require('node:fs');
const path = require('node:path');
const validator = require('/Users/xirothedev/.agents/skills/security-audit/validate-findings.cjs');
const schema = JSON.parse(fs.readFileSync('/Users/xirothedev/.agents/skills/security-audit/report-schema.json', 'utf8'));
const run = path.join(__dirname, '..');
const records = JSON.parse(fs.readFileSync(path.join(run, 'findings.json'), 'utf8'));
const assignments = JSON.parse(fs.readFileSync(path.join(run, 'confirmed-review-assignments.json'), 'utf8'));
const outputs = [];
const reviews = [];
for (const item of assignments) {
  const primary = path.join(run, 'agents', item.agent_id, 'scratch', 'source-result.json');
  const fallback = path.join(run, 'agents', `${item.agent_id}b`, 'scratch', 'source-result.json');
  const file = fs.existsSync(primary) ? primary : fallback;
  if (!fs.existsSync(file)) throw new Error(`Missing confirmation review ${item.agent_id}`);
  const review = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!['verified', 'replace', 'rejected'].includes(review.decision)) throw new Error(`Invalid decision from ${item.agent_id}`);
  reviews.push({agent_id: item.agent_id, fingerprint: item.fingerprint, ...review});
  const index = records.findIndex(r => r.fingerprint === item.fingerprint);
  if (index < 0) throw new Error(`Unknown fingerprint ${item.fingerprint}`);
  if (review.decision === 'replace') {
    const errors = validator.validateDocument([review.record], schema);
    if (errors.length) throw new Error(errors.join('\n'));
    const prior = records[index];
    const material = review.record.verdict !== 'confirmed' ||
      JSON.stringify(review.record.trace) !== JSON.stringify(prior.trace) ||
      JSON.stringify(review.record.execution.payloads) !== JSON.stringify(prior.execution.payloads) ||
      review.record.execution.observed_result !== prior.execution.observed_result ||
      JSON.stringify(review.record.severity) !== JSON.stringify(prior.severity);
    if (material) throw new Error(`Fresh verifier required for material replacement of ${item.fingerprint}`);
    records[index] = review.record;
  }
}
for (const review of reviews.filter(r => r.decision === 'verified' || r.decision === 'replace')) {
  const record = records.find(r => r.fingerprint === review.fingerprint);
  if (!record || record.verdict !== 'confirmed') throw new Error(`Unverified retained confirmed record ${review.fingerprint}`);
}
const errors = validator.validateDocument(records, schema);
if (errors.length) throw new Error(errors.join('\n'));
fs.writeFileSync(path.join(run, 'findings.json'), `${JSON.stringify(records, null, 2)}\n`);
fs.writeFileSync(path.join(run, 'confirmed-verification.json'), `${JSON.stringify(reviews, null, 2)}\n`);
console.log(`Recorded ${reviews.length} independent confirmation reviews; ${reviews.filter(r => r.decision === 'verified').length} verified, ${reviews.filter(r => r.decision === 'replace').length} non-material corrections, ${reviews.filter(r => r.decision === 'rejected').length} rejected`);
