const fs = require('node:fs');
const path = require('node:path');
const audit = require('./audit-tools.cjs');
const validator = require(path.join(audit.skill, 'validate-findings.cjs'));

const records = audit.readJson('candidate-records.json');
const alias = 'daemon/observations/projectless-collector-log-context';
const canonical = 'apps/daemon/src/reads.ts:collector-evidence-without-project';
const alternate = records.find(item => item.fingerprint === alias);
const retained = records.find(item => item.fingerprint === canonical);
if (!alternate || !retained) throw new Error('Expected both source-grounded collector variants');

retained.description += ' The Event-driven diagnosis path reaches the same host-wide log reader: observations supplies an Event Project, but the production main callback drops it before ReadRuntime.logs. Ordinary private log text can therefore enter the wrong Project\'s model context under the same ownership conditions, independently of an MCP HTTP context handoff. No provider request or persisted diagnosis was observed.';
retained.evidence.push(
  {file: 'apps/daemon/src/observations.ts', line: 138, description: 'The diagnosis path supplies service, 300 lines and the Event Project to its logs callback, then uses the returned logs in the Project-scoped diagnosis.'},
  {file: 'apps/daemon/src/main.ts', line: 121, description: 'The production observation logs callback accepts only service and lines and calls the same Projectless ReadRuntime.logs method, dropping the Event Project.'},
  {file: 'packages/diagnoser/src/context.ts', line: 35, description: 'Fetched logs become prepared diagnosis evidence; redaction and quotation validation do not add an ownership predicate.'},
  {file: 'packages/gateway/src/gateway.ts', line: 96, description: 'The model adapter receives the prepared log context for the active diagnosis, establishing a source-visible alternate output path from the same wrongly scoped reader.'}
);
retained.blockers.push('The Event-driven variant needs a separate dummy prompt-capture check. It does not depend on the MCP HTTP AsyncLocalStorage handoff; a return of that context through an actual model is not established or required by the minimum claimed prompt-placement result.');
retained.validation_plan.local += ' Independently exercise the Event-driven variant with a Project-2 runtime.oom Event naming the Project-1 workload, real observation/log-read composition and a fake model adapter. Stop when a Project-1 nonsecret private-log marker appears in the Project-2 adapter request; no real provider is called.';
retained.validation_plan.deployment = alternate.validation_plan.deployment;

const final = records.filter(item => item.fingerprint !== alias).sort((a,b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0);
const errors = validator.validateDocument(final, JSON.parse(audit.schema));
if (errors.length) throw new Error(errors.join('\n'));
const ledger = audit.readJson('coverage-ledger.json');
for (const unit of ledger) {
  if (!unit.result_fingerprints.includes(alias)) continue;
  unit.result_fingerprints = [...new Set(unit.result_fingerprints.map(item => item === alias ? canonical : item))];
  unit.root_cause_aliases ??= [];
  unit.root_cause_aliases.push({alias, canonical, reason: 'Both variants reach the same host-wide collector reader whose final resource lookup lacks Project authorization; MCP and Event diagnosis are alternate entry/output paths for that root cause.'});
}
audit.saveLedger(ledger);
audit.writeJson('candidate-records.json', final);
audit.writeJson('candidate-aliases.json', [{alias, canonical, reason: 'Shared Projectless collector evidence resolver; preserve both entry/output variants in one candidate.'}]);
console.log(`Consolidated collector variants; ${final.length} unique candidate records remain`);
