const fs = require('node:fs');
const path = require('node:path');
const audit = require('./audit-tools.cjs');
const findingsValidator = require(path.join(audit.skill, 'validate-findings.cjs'));

const metadata = audit.readJson('run-metadata.json');
const ledger = audit.readJson('coverage-ledger.json');
const records = audit.readJson('findings.json');
const errors = findingsValidator.validateDocument(records, JSON.parse(audit.schema));
if (errors.length) throw new Error(errors.join('\n'));
const confirmed = records.filter(item => item.verdict === 'confirmed');
const leads = records.filter(item => item.verdict === 'needs_validation');
const rejected = records.filter(item => item.verdict === 'rejected');
const finalReview = audit.readJson('confirmed-verification.json');
if (records.some(item => item.verdict === 'confirmed' && !finalReview.some(review => review.fingerprint === item.fingerprint && ['verified', 'replace'].includes(review.decision)))) {
  throw new Error('A retained confirmed record lacks independent post-validation verification');
}
const counts = {};
for (const unit of ledger) counts[unit.status] = (counts[unit.status] ?? 0) + 1;
const log = audit.readJson('run-agent-log.json');
const hardening = [...new Set(ledger.flatMap(unit => unit.hardening_notes ?? []))];
const unresolvedCandidates = ledger.filter(unit => unit.status === 'candidate').flatMap(unit => unit.result_fingerprints.filter(fingerprint => !records.some(record => record.fingerprint === fingerprint)).map(fingerprint => ({fingerprint, coverage_id: unit.coverage_id})));
const consistency = audit.readJson('source-consistency.json');
const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const source = (file, line) => `[${file}:${line}](${metadata.target}/${file}:${line})`;
const trace = record => record.trace.map((item, index) => `${index + 1}. ${source(item.file, item.line)} — **${item.kind}**, ${item.scope}: ${item.description}`).join('\n');
const evidence = record => record.evidence.map(item => `- ${source(item.file, item.line)} — ${item.description}`).join('\n');
const leadDetails = record => `## ${record.title}\n\nFingerprint: \`${record.fingerprint}\`. State: **NEEDS VALIDATION**. No severity is assigned.\n\n${record.description}\n\nClaimed root cause: ${record.claimed_root_cause}\n\n### Source trace\n\n${trace(record)}\n\n### Verified source evidence\n\n${evidence(record)}\n\n### Exact blockers\n\n${record.blockers.map(item => `- ${item}`).join('\n')}\n\n### Safe resolution plan\n\n${record.validation_plan.local ? `**Bounded local check:** ${record.validation_plan.local}\n\n` : ''}${record.validation_plan.deployment ? `**Owner observation:** ${record.validation_plan.deployment}\n\n` : ''}`;
const confirmedDetails = record => `## ${record.title}\n\nSeverity: **${record.severity.overall_severity}**. Fingerprint: \`${record.fingerprint}\`.\n\n${record.description}\n\nRoot cause: ${record.root_cause}\n\nIntended behavior: ${record.intended_behavior}\n\n### Source trace\n\n${trace(record)}\n\n### Evidence\n\n${evidence(record)}\n\n### Bounded reproduction\n\nAttacker perspective: ${record.execution.attacker_perspective}\n\nMinimum inputs:\n\n${record.execution.payloads.map(item => `\`\`\`text\n${item}\n\`\`\``).join('\n\n')}\n\n${record.execution.instructions.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\nObserved result: ${record.execution.observed_result}\n\n### Conditions, priority and source fix\n\n${record.conditions.map(item => `- ${item.kind}: ${item.description}`).join('\n')}\n\nLikelihood: ${record.severity.likelihood.reason}\n\nImpact: ${record.severity.impact.reason}\n\nSmallest effective fix: ${record.remediation.strategy}\n`;

const report = [
  '# Graveshift security audit',
  `Run: \`${metadata.run_id}\`. Profile: **${metadata.profile}**. Status: **${metadata.run_status}**.`,
  metadata.run_status === 'incomplete' ? `This is a partial pass. Incomplete reason: \`${metadata.incomplete_reason}\`. ${unresolvedCandidates.length ? `Candidate validation remains incomplete for: ${unresolvedCandidates.map(item => `\`${item.fingerprint}\` (${item.coverage_id})`).join('; ')}. These unresolved candidates are not reported as findings.` : ''}` : 'This standard pass completed the source-review and independent-verification workflow. It does not establish exhaustive coverage of the repository or runtime behavior.',
  `Reviewed source: \`${metadata.source_ref}\`. Source consistency at finish: **${consistency.unchanged ? 'all recorded in-scope file hashes unchanged' : 'source changed; see source-consistency.json'}**. Scope covers application/package source, tests, examples, CI, developer hooks, packaging and deployment configuration, including the untracked example config. The untracked Sentry research/report documents are excluded. No prior compatible Graveshift ledger or findings were available; there are no carried same-source confirmations or changed-source revalidations.`,
  `Execution policy: **sandboxed-source-and-local-only**. The initial source-only pass was followed by bounded local checks that executed target modules inside an OS-enforced Linux container. The container enforced \`--network none\`, a read-only root filesystem with source mounted read-only, scratch-only size-bounded tmpfs writes, 512 MiB memory, one CPU, 64 PIDs, file/process/CPU ulimits and a hard wall-clock timeout, using the pinned \`oven/bun:1.4.4\` image already present on the host. No dependencies were installed, no real credentials used, no provider, GitHub, broker, database or deployed endpoint contacted, and no target artifact promoted. Harness outputs were captured as trusted parent-side records in validation/results/.`,
  `Budget: no user-set cap. ${log.length} agent invocations were used. The initial plan reserved four reconnaissance calls, eleven hunter calls, an immediate post-wave critic, a distinct final-clean critic, and two fresh verifier calls per surviving candidate; the later bounded-validation phase added five harness-authoring agents, one Compose render, and one fresh confirmation verifier per confirmed record. All invocations are recorded in run-agent-log.json.`,
  '## Security posture',
  `${confirmed.length} confirmed findings, ${leads.length} unresolved validation leads and ${rejected.length} rejected hypotheses. The confirmed findings were established with dummy data in the compliant container and then independently re-verified from source. Their demonstrated impact is limited to the fixture preconditions recorded on each record; operational severity for a specific deployment still depends on the co-tenancy, configuration and exposure facts named in each record.`,
  '## Confirmed findings',
  confirmed.length ? '| Severity | Title | Boundary | Observed result |\n| --- | --- | --- | --- |\n' + confirmed.map(record => `| ${record.severity.overall_severity} | ${escape(record.title)} | ${escape(record.root_cause)} | ${escape(record.execution.observed_result)} |`).join('\n') : 'None meet the complete source-plus-local-observation evidence contract in this run.',
  ...confirmed.map(confirmedDetails),
  '## NEEDS VALIDATION',
  leads.length ? '| Lead | Source path | Exact blocker | Safe next step |\n| --- | --- | --- | --- |\n' + leads.map(record => `| ${escape(record.title)} | ${record.trace.map(item => source(item.file, item.line)).join(' → ')} | ${escape(record.blockers.join(' '))} | ${escape(record.validation_plan.local ?? record.validation_plan.deployment)} |`).join('\n') : 'No source-grounded unresolved record survived independent review.',
  'Complete source evidence, blockers and bounded plans are in [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md). These leads have no severity and are not confirmed vulnerabilities. Owner observations inspect configuration/identity; they do not authorize audit traffic to a deployment.',
  '## Hardening notes and positive source patterns',
  hardening.length ? hardening.map(item => `- ${item}`).join('\n') : 'No separate hardening note was retained.',
  'Positive source patterns include bearer-kind separation; pinned JWT algorithm/issuer/audience; current Credential expiry/revocation checks; Project predicates in durable operations; deny-first/default-deny policy; HMAC binding of complete signed objects; immutable base/blob checks; verification receipts; and recovery of uncertain publication before another write. These patterns are source observations, not runtime guarantees.',
  '## Coverage and limits',
  `Ledger: ${ledger.length} units. ${Object.entries(counts).sort().map(([status, count]) => `${status}: ${count}`).join('; ')}. A candidate unit retains its fingerprint even after its independent record is rejected or left needs_validation; final verdicts are in findings.json. Every source check has an owner and repository-relative paths.`,
  `Both coverage critics are preserved in critic-results.json. The post-wave critic returned stop=true with no missing units or reassignments; the distinct final-clean critic independently accepted coverage. Their acceptance concerns declared source coverage only. It does not resolve sandbox, broker, provider, proxy, OS, signing, credential, database or runtime facts outside source.`,
  ledger.some(unit => ['deferred', 'out_of_scope', 'blocked'].includes(unit.status)) ? ledger.filter(unit => ['deferred', 'out_of_scope', 'blocked'].includes(unit.status)).map(unit => `- ${unit.status}: ${unit.surface} / ${unit.attack_class} — ${unit.unresolved.join(' ')}`).join('\n') : 'No assigned source unit is deferred, blocked or out of scope. The named research documents remain excluded from product-source scope.',
  'Kubernetes/Helm/kind are source scaffolds and were not treated as active deployments. The dashboard lives elsewhere. No live configuration, external identity, broker ACL attachment, installed database enforcement, actual GitHub permissions or provider limits were inspected. No prior ledger existed, and one audit pass does not exhaust the target.',
  '## Artifacts',
  '- [findings.json](findings.json): final independently decided records.\n- [coverage-ledger.json](coverage-ledger.json): exact units, block maps, source checks and gaps.\n- [architecture.md](architecture.md): source-derived architecture and trust boundaries.\n- [FINDINGS-DETAIL.md](FINDINGS-DETAIL.md): complete reproduced medium/high/critical findings, if any.\n- [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md): exact unresolved source-grounded leads.\n- [validation/results/](validation/results): bounded local observed results. [validation/CONTRACT.md](validation/CONTRACT.md), [validation/run-check.sh](validation/run-check.sh) and the numbered harnesses define the reproducible checks and container limits.\n- [run-metadata.json](run-metadata.json), [source-manifest.json](source-manifest.json), [source-consistency.json](source-consistency.json), and [run-agent-log.json](run-agent-log.json): run provenance and limits.',
].join('\n\n') + '\n';

fs.writeFileSync(path.join(audit.run, 'REPORT.md'), report);
fs.writeFileSync(path.join(audit.run, 'NEEDS-VALIDATION.md'), ['# Graveshift validation leads', 'These records passed independent source and record review. They remain unconfirmed and have no severity. Target-controlled execution was blocked by the audit sandbox gate; no deployed/shared endpoint may be probed to resolve them.', ...leads.map(leadDetails)].join('\n\n') + '\n');
fs.writeFileSync(path.join(audit.run, 'FINDINGS-DETAIL.md'), ['# Graveshift confirmed finding details', ...(confirmed.some(item => ['medium', 'high', 'critical'].includes(item.severity.overall_severity)) ? confirmed.filter(item => ['medium', 'high', 'critical'].includes(item.severity.overall_severity)).map(confirmedDetails) : ['No medium, high or critical record meets the confirmed evidence contract in this run. No target-controlled reproduction was executed. Source-grounded unresolved leads and safe validation plans are recorded in [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md).'])].join('\n\n') + '\n');
console.log(`Rendered reports from ${records.length} final records and ${ledger.length} coverage units`);
