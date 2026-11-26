const fs = require('node:fs');
const path = require('node:path');
const audit = require('./audit-tools.cjs');

function makeRoot(agentId) {
  const root = path.join(audit.run, 'agents', agentId);
  fs.mkdirSync(path.join(root, 'scratch'), {recursive: true});
  fs.mkdirSync(path.join(root, 'artifacts'), {recursive: true});
  return root;
}

function critic(agentId, finalClean = false) {
  const root = makeRoot(agentId);
  const ledger = audit.readJson('coverage-ledger.json');
  const candidatesFile = path.join(audit.run, 'candidate-records.json');
  const candidates = fs.existsSync(candidatesFile) ? JSON.parse(fs.readFileSync(candidatesFile, 'utf8')).map(item => ({fingerprint: item.fingerprint, state: item.verdict})) : [];
  const prompt = [
    `You are a fresh source-only ${finalClean ? 'final-clean' : 'immediate post-wave'} coverage critic, agent ${agentId}. Read source but do not execute targets, contact networks, edit source, or write shared files. Your job is to propose omitted coverage, not findings.`,
    fs.readFileSync(path.join(audit.run, 'architecture.md'), 'utf8'),
    `Full current coverage ledger and assignment block maps:\n${JSON.stringify(ledger, null, 2)}`,
    `Current candidate fingerprints/states:\n${JSON.stringify(candidates, null, 2)}\nPrior-ledger gap summary: No compatible prior Graveshift ledger or findings exist. There are no carried prior exclusions.`,
    fs.readFileSync(path.join(audit.skill, 'HUNTING.md'), 'utf8').split('## Coverage-critic waves\n')[1],
    `Check unmapped entry points, unchecked parallel paths and lifecycle modes, selected companion classes lacking units, unjustified exclusions, insufficient path/check evidence, and all current planned or unresolved coverage. A needs_validation candidate with an exact sandbox/deployment blocker is already reviewed coverage and need not be reassigned just to rerun blocked execution. Source-grounded missing boundaries require their own stable unit. Do not propose speculative categories absent from this repository. Target scope covers all current product source, examples, CI, hooks and deployment definitions; untracked reports/research_notes are excluded. No ignored env files or credentials may be read.`,
    `Return exactly the JSON object in the critic contract. For each reassign_ids item, include a corresponding missing_units entry using that unit's same semantic fields and a reason that explains the source-backed gap; the parent will treat that duplicate tuple as the reason for reopening, not a new unit. Save the same JSON to ${root}/scratch/source-result.json. Do not write elsewhere. No local artifact is permitted or needed.`,
  ].join('\n\n');
  fs.writeFileSync(path.join(root, 'scratch', 'assignment.md'), prompt);
  console.log(JSON.stringify({agentId, prompt: path.join(root, 'scratch', 'assignment.md')}));
}

function verifiers(phase) {
  const records = audit.readJson(phase === 3 ? 'candidate-records.json' : 'findings.json').filter(item => phase === 3 || item.verdict !== 'rejected');
  const ledger = audit.readJson('coverage-ledger.json');
  const contracts = fs.readFileSync(path.join(audit.skill, 'VALIDATION-AND-REPORTING.md'), 'utf8');
  const inputList = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const agentId = `${phase === 3 ? 'validate' : 'record'}-${String(index + 1).padStart(2, '0')}`;
    const root = makeRoot(agentId);
    const linked = ledger.filter(unit => unit.result_fingerprints.includes(record.fingerprint));
    const companions = [...new Set(linked.flatMap(unit => unit.selected_companion_blocks.filter(ref => ref.endsWith('#Validation rules'))))];
    const prompt = [
      phase === 3 ? audit.fence('VALIDATION-AND-REPORTING.md', 'Candidate-verifier prompt') : contracts.split('### Phase 5:')[1].split('### Phase 6:')[0],
      `Target: /Users/xirothedev/workspace/graveshift\nAgent ID: ${agentId}\nYou are independent of the hunter and any earlier verifier. Source-only review is required: complete audit sandbox controls are unavailable, including explicit memory and cumulative disk limits. Do not run target code, tests, builds, project scripts or fixture processing. Never contact deployed/shared services or read ignored credential/local-settings files. Do not fabricate observed local behavior.`,
      `Candidate/final record to independently assess:\n${JSON.stringify(record, null, 2)}`,
      phase === 3 ? `Linked coverage-unit source checks:\n${JSON.stringify(linked.map(unit => ({coverage_id: unit.coverage_id, local_checks: unit.local_checks})), null, 2)}` : 'Do not read hunter results, other verifier messages, the findings list or source-result files. Verify this record directly against current source.',
      fs.readFileSync(path.join(audit.run, 'architecture.md'), 'utf8'),
      ...companions.map(audit.blockText),
      audit.fence('VALIDATION-AND-REPORTING.md', 'Copy this promotion procedure verbatim'),
      `Report schema, all three branches copied verbatim:\n${audit.schema}`,
      `Prior records with the same fingerprint: none. Your scratch directory: ${root}/scratch/. Parent-owned artifacts directory: ${root}/artifacts/. Promotion allowlist: []; per-file/cumulative byte limits: zero. No target process or local artifact is allowed. You may save your source-only structured reply to ${root}/scratch/source-result.json and must return the same complete JSON in your response; that file is a message copy and is never artifact evidence. Do not write elsewhere. Preserve the fingerprint.`,
      phase === 3 ? 'Return exactly {"decision":"needs_validation|rejected","record":{...}} matching the schema. A missing best practice or hypothetical deployment without a concrete lower-trust principal/resource is rejected. A source-supported trace blocked only on exact runtime/deployment evidence remains needs_validation without severity.' : 'Return exactly {"decision":"verified","fingerprint":"..."} or {"decision":"replace","reason":"...","record":{...}}. Every blocker must be decisive; remove factual errors. A source-only check cannot promote to confirmed.',
    ].join('\n\n');
    fs.writeFileSync(path.join(root, 'scratch', 'assignment.md'), prompt);
    inputList.push({agent_id: agentId, fingerprint: record.fingerprint, prompt: path.join(root, 'scratch', 'assignment.md')});
  }
  audit.writeJson(`phase-${phase}-assignments.json`, inputList);
  console.log(JSON.stringify(inputList, null, 2));
}

if (require.main === module) {
  if (process.argv[2] === 'critic') critic(process.argv[3], process.argv[4] === 'final');
  else if (process.argv[2] === 'verifiers') verifiers(Number(process.argv[3]));
  else throw new Error('Unknown review preparation action');
}

module.exports = {critic, verifiers};
