const fs = require('node:fs');
const path = require('node:path');
const audit = require('./audit-tools.cjs');
const validator = require(path.join(audit.skill, 'validate-findings.cjs'));

const canonical = 'daemon/fix-context/service-only-repository-selection';
const alias = 'daemon/fix-context/service-only-repository-authorization';
const records = audit.readJson('candidate-records.json');
const keep = records.find(r => r.fingerprint === canonical);
const drop = records.find(r => r.fingerprint === alias);
if (!keep || !drop) throw new Error('Expected both fix-context candidate variants');

keep.description += ' Independent review of the same trace from the patch-execution boundary confirms that repository selection uses only snapshot.item.service, that RepoPolicy has no Project selector, and that the final publication check repeats service membership only; a caller-supplied Deployment SHA in its own Project supplies a syntactically valid commit point.';
for (const ev of drop.evidence) if (!keep.evidence.some(e => e.file === ev.file && e.line === ev.line)) keep.evidence.push(ev);
const sink = keep.trace.find(t => t.kind === 'sink');
keep.trace = keep.trace.filter(t => t.kind !== 'sink');
for (const tr of drop.trace) {
  if (tr.kind === 'sink') continue;
  if (!keep.trace.some(t => t.file === tr.file && t.line === tr.line)) keep.trace.push(tr);
}
if (sink) keep.trace.push(sink);
keep.blockers.push('A second independent review confirms that the selected repository is read with the instance GitHub App and a draft may be written there, but no bounded two-Project fixture observed that result.');
keep.validation_plan.local += ' A second review recommends a fake GitHub repository intended for only one dummy Project: return valid own-Project context for the other Project with the same service and a harmless known base SHA, then record whether contextClient selects the first Project\'s repository and whether a recording GitHub client receives createPullRequest for it.';

const final = records.filter(r => r.fingerprint !== alias).sort((a,b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0);
const errors = validator.validateDocument(final, JSON.parse(audit.schema));
if (errors.length) throw new Error(errors.join('\n'));
const ledger = audit.readJson('coverage-ledger.json');
for (const unit of ledger) {
  if (!unit.result_fingerprints.includes(alias)) continue;
  unit.result_fingerprints = [...new Set(unit.result_fingerprints.map(f => f === alias ? canonical : f))];
}
audit.saveLedger(ledger);
audit.writeJson('candidate-records.json', final);
audit.writeJson('candidate-aliases.json', [...audit.readJson('candidate-aliases.json'), {alias, canonical, reason: 'Service-only repository selection is one root cause surfaced at both the model-delegation and patch-execution boundaries.'}]);
console.log(`Merged fix-context variants; ${final.length} unique candidate records remain`);
